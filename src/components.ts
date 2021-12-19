import Rete, {Engine, Input, Output, Socket} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {LabelControl, LangTypeSelectControl, TextInputControl} from "./controls"
import {LangCoreDesc, LangDesc, LangFunctionDesc, LangTypeDesc} from "./lang"
import {Component} from "rete/types"


const flowSocket = new Rete.Socket('execution-flow')

enum SocketType {
    constant = 0b01, // 0b ref const
    ref = 0b10,
    constRef = 0b11,
}

class LangSocket extends Socket {
    typeName: string
    socketType: SocketType

    constructor(typeName: string, socketType: SocketType) {
        super(typeName + (socketType & 0b1 ? ' const' : '') + (socketType & 0b10 ? ' &' : ''))
        this.typeName = typeName
        this.socketType = socketType
    }

    compatibleWith(socket: Socket): boolean {
        if (this === socket)
            return true
        if (socket instanceof LangSocket && socket.typeName == this.typeName) {
            if (socket.socketType == SocketType.ref)
                return this.socketType == SocketType.ref
            if (socket.socketType == SocketType.constRef)
                return this.socketType == SocketType.constRef || this.socketType == SocketType.ref
            return true
        }
        return super.compatibleWith(socket)
    }
}

export class LangType {
    desc: LangTypeDesc
    validator?: RegExp
    defaultValue?: string
    ctor: (s: string, args: { [key: string]: string }) => string = s => s
    anyTypeSocket?: Socket

    private sockets = new Map<SocketType, LangSocket>()

    getSocket(socketType: SocketType): LangSocket {
        if (this.sockets.has(socketType))
            return this.sockets.get(socketType)!

        const res = new LangSocket(this.desc.baseMn ?? this.desc.mn, socketType)
        if (this.anyTypeSocket)
            res.combineWith(this.anyTypeSocket)
        this.sockets.set(socketType, res)
        return res
    }
}


// TODO: immutable, mutable and any types
const coreTypes = new Map</*mn*/string, LangType>()
const coreTypeGroups = new Map<string, LangType[]>()


function getType(mn: string): LangType | undefined {
    if (coreTypes.has(mn))
        return coreTypes.get(mn)
    return undefined
}


function getTypeName(mn:string): string {
    const type = getType(mn)
    return type ? type.desc.typeName : mn
}


function getBaseType(mn: string): LangType | undefined {
    const res = getType(mn)
    if (res && res.desc.baseMn)
        return getType(res.desc.baseMn) ?? res
    return res
}

export function getBaseTypeName(mn: string): string {
    const res = getBaseType(mn)
    return res ? res.desc.typeName : mn
}


export function getTypeByMN(types: LangType[], mn: string): LangType {
    for (let baseType of types) {
        if (baseType.desc.mn == mn) {
            return baseType
        }
    }
    return types[0]
}


export function generateCoreNodes(langCore: LangCoreDesc, lang: LangDesc, editor: NodeEditor, engine: Engine) {
    // console.log(langCore)
    const logicTypeName = langCore.logicType
    const anyTypeName = langCore.anyType
    const voidTypeName = langCore.voidType
    const anyTypeSocket = anyTypeName ? new Rete.Socket(anyTypeName) : undefined
    const comps: Component[] = []
    for (const typeDesc of langCore.types) {
        let group = typeDesc.group ?? typeDesc.mn

        let type = new LangType()
        type.desc = typeDesc
        type.defaultValue = typeDesc.default
        // type.socket = new Rete.Socket(typeDesc.mn)
        type.anyTypeSocket = anyTypeSocket

        if (typeDesc.validator)
            type.validator = new RegExp(typeDesc.validator)

        if (typeDesc.ctor)
            type.ctor = (s, args) => {
                if (!typeDesc.ctor)
                    return s
                const argsKeys = Object.keys(args)
                if (argsKeys.length > 0) {
                    let res = typeDesc.ctor
                    for (const argName of argsKeys) {
                        res = res.replace(`\$${argName}`, args[argName])
                    }
                    return res
                }
                return typeDesc.ctor.replace('$', s) ?? s
            }

        coreTypes.set(typeDesc.mn, type)
        if (coreTypeGroups.has(group))
            coreTypeGroups.get(group)?.push(type)
        else
            coreTypeGroups.set(group, [type])

        if (typeDesc.mn == logicTypeName)
            comps.push(new If(type), new While(type))

        // TODO: remove this
        if (typeDesc.mn == "f")
            comps.push(new Sin(type))
    }

    if (anyTypeSocket)
        comps.push(new Debug(anyTypeSocket))

    comps.push(new Function())

    for (let [groupName, coreTypeGroup] of coreTypeGroups) {
        if (groupName == voidTypeName || groupName == anyTypeName)
            continue
        const langLet = new LangLet(groupName, ['core types'], coreTypeGroup)
        comps.push(langLet)
    }

    if (langCore.functions)
        console.error("core functions are not supported yet")

    for (let typeDesc of lang.types) {
        if (coreTypes.has(typeDesc.mn))
            continue
        let type = new LangType()
        type.desc = typeDesc
        type.anyTypeSocket = anyTypeSocket
        coreTypes.set(typeDesc.mn, type)
        // TODO: search ctors without args and add ctor nodes
    }

    for (const func of lang.functions) {
        const fn = new LangFunc(func)
        comps.push(fn)
    }

    for (let comp of comps) {
        engine.register(comp)
        editor.register(comp)
    }
}


export abstract class LangComponent extends Rete.Component {
    group: string[] // context menu path

    get topLevel(): boolean {
        return this._topLevel
    }

    private lazyInit = true
    private flowOut = false
    protected _topLevel = false

    protected constructor(name: string, group: string[] = ['language']) {
        super(name)
        this.group = group
    }

    worker(node, inputs, outputs) {
    }

    addFlowIn(node: Node, key = 'fin'): Input {
        this.lazyInit = false
        const flowIn = new Rete.Input(key, '', flowSocket, false)
        node.addInput(flowIn)
        return flowIn
    }

    addFlowOut(node: Node, key = 'fout'): Output {
        this.flowOut = true
        const flowOut = new Rete.Output(key, '', flowSocket, false)
        node.addOutput(flowOut)
        return flowOut
    }

    addFlowInOut(node: Node) {
        this.addFlowIn(node)
        this.addFlowOut(node)
    }

    // writer

    constructDas(node: Node, ctx: ConstructDasCtx): boolean {
        const res = this.constructDasNode(node, ctx)
        if (res && this.flowOut)
            this.constructDasFlowOut(node, ctx)
        return res
    }


    abstract constructDasNode(node: Node, ctx: ConstructDasCtx): boolean


    constructOptionalInNode(node: Node, name: string, ctx: ConstructDasCtx): Node | null {
        const inValue = node.inputs.get(name)
        if (!inValue || inValue.connections.length == 0) {
            return null
        }
        const inNode = inValue.connections[0].output.node
        if (!inNode) {
            return null
        }
        LangComponent.constructAutoInit(inNode, ctx)
        return inNode
    }

    constructInNode(node: Node, name: string, ctx: ConstructDasCtx): Node | null {
        const inNode = this.constructOptionalInNode(node, name, ctx)
        if (!inNode)
            ctx.addError(node, 'input expected')
        return inNode
    }


    private static constructAutoInit(node: Node, ctx: ConstructDasCtx) {
        if (ctx.isLazyInited(node))
            return
        const component = <LangComponent>ctx.editor.components.get(node.name)
        if (!component.lazyInit)
            return
        ctx.setIsLazyInit(node)
        component.constructDas(node, ctx)
    }


    constructDasFlowOut(node: Node, ctx: ConstructDasCtx, key = 'fout'): boolean {
        const out = node.outputs.get(key)
        if (!out || out.connections.length == 0)
            return false
        const nextNode = out.connections[0].input.node
        if (!nextNode)
            return false
        const component = <LangComponent>ctx.editor.components.get(nextNode.name)
        return component.constructDas(nextNode, ctx)
    }
}


export class LangLet extends LangComponent {
    baseTypes: LangType[]

    constructor(name: string, group: string[], types: LangType[]) {
        super(`Let: ${name}`, group)
        this.baseTypes = types
    }

    async builder(node) {
        let type = 'mn' in node.data ? getTypeByMN(this.baseTypes, node.data.mn) : this.baseTypes[0]
        const out = new Rete.Output('result', 'Result', type.getSocket(SocketType.constRef), true)
        node.addOutput(out)
        let struct = this.baseTypes[0].desc.struct
        if (struct) {
            for (const field of struct) {
                const fieldType = getType(field.mn)
                if (!fieldType)
                    continue
                const fieldInput = new Rete.Input(field.name, field.name, fieldType.getSocket(SocketType.constant), false)
                fieldInput.addControl(new TextInputControl(this.editor, field.name))
                node.addInput(fieldInput)
            }
        } else {
            if (this.baseTypes.length > 1)
                node.addControl(new LangTypeSelectControl(this.editor, 'mn', this.baseTypes))
            const input = new Rete.Input('value', 'Value', type.getSocket(SocketType.constant), false)
            input.addControl(new TextInputControl(this.editor, 'value'))
            node.addInput(input)
        }

        node.data.mn = type.desc.mn
    }

    worker(node, inputs, outputs) {
        outputs['mn'] = node.data.mn
        const nodeRef = this.editor?.nodes.find(it => it.id == node.id)
        if (!nodeRef)
            return
        let currentType = getTypeByMN(this.baseTypes, node.data.mn)
        const inputControls = new Map<Input, LangType>()
        const struct = currentType.desc.struct
        if (struct) {
            for (const field of struct) {
                const fieldInput = nodeRef.inputs.get(field.name)
                if (fieldInput)
                    inputControls.set(fieldInput, <LangType>getType(field.mn))
            }
        } else {
            let valueInput = nodeRef.inputs.get('value')
            if (valueInput)
                inputControls.set(valueInput, currentType)
        }

        for (const [input, valueType] of inputControls) {
            // update input socket connections
            if (input.socket != valueType.getSocket(SocketType.constant)) {
                input.socket = valueType.getSocket(SocketType.constant)
                for (const conn of [...input.connections]) {
                    if (!conn.output.socket.compatibleWith(input.socket)) {
                        this.editor?.removeConnection(conn)
                        delete inputs[input.key]
                    }
                }
            }
            if (input.hasConnection())
                continue
            const valueCtrl = <TextInputControl>input.control
            // validate control value
            if (valueCtrl.validator != valueType.validator || valueCtrl.defaultValue != valueType.defaultValue || valueCtrl.values != valueType.desc.enum) {
                valueCtrl.validator = valueType.validator
                valueCtrl.defaultValue = valueType.defaultValue ?? ""
                valueCtrl.values = valueType.desc.enum
                valueCtrl.setValue(node.data[input.key]) // revalidate data
            }
        }

        const output = nodeRef.outputs.get('result')
        // update output socket connections
        if (output && output.socket != currentType.getSocket(SocketType.constRef)) {
            output.socket = currentType.getSocket(SocketType.constRef)
            output.name = currentType.desc.mn
            for (const conn of [...output.connections]) {
                if (!output.socket.compatibleWith(conn.input.socket)) {
                    this.editor?.removeConnection(conn)
                }
            }
        }
        const ctorArgs: { [key: string]: string } = {}

        if (struct)
            for (const field of struct)
                ctorArgs[field.name] = inputs[field.name]?.length ? inputs[field.name] : node.data[field.name]

        outputs['result'] = currentType.ctor(inputs.value?.length ? inputs.value : node.data.value, ctorArgs)
    }

    constructDasNode(node, ctx) {
        const currentType = getTypeByMN(this.baseTypes, node.data.mn)
        const ctorArgs: { [key: string]: string } = {}
        const struct = currentType.desc.struct
        let valueData = node.data.value
        if (struct) {
            for (const field of struct) {
                const input = this.constructOptionalInNode(node, field.name, ctx)
                if (input)
                    ctorArgs[field.name] = ctx.nodeId(input)
                else
                    ctorArgs[field.name] = getType(field.mn)?.ctor(node.data[field.name], {}) ?? ""
            }
        } else {
            const input = this.constructOptionalInNode(node, 'value', ctx)
            if (input)
                valueData = ctx.nodeId(input)
        }


        const val = currentType.ctor(valueData, ctorArgs)
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${val}`)
        return true
    }
}


export class LangFunc extends LangComponent {
    private fn: LangFunctionDesc;

    constructor(fn: LangFunctionDesc) {
        const resTypeName = getTypeName(fn.resMn);
        const name = fn.name + "(" + fn.args.map(it => getTypeName(it.mn)).join(",") + "):" + resTypeName
        super(name, ['language', resTypeName, fn.name])
        this.fn = fn
    }

    async builder(node) {
        for (let arg of this.fn.args) {
            const argType = getBaseType(arg.mn)
            if (!argType) {
                console.error(`Func ${this.fn.name} arg ${arg.name} has unknown type ${arg.mn}`)
                continue
            }
            // if (argType.desc.baseMn)
            //     argType = getType(argType.desc.baseMn)
            // if (!argType) {
            //     console.error(`Func ${this.fn.name} arg ${arg.name} has unknown base type ${arg.mn}`)
            //     continue
            // }
            // TODO: copy const/ref from arg.mn type
            // TODO: handle canCopy flag
            const fieldInput = new Rete.Input(arg.name, arg.name, argType.getSocket(SocketType.constant), false)
            // fieldInput.addControl(new TextInputControl(this.editor, field.name))
            node.addInput(fieldInput)
        }

        const result = new Rete.Output('result', 'result', getType(this.fn.resMn)!.getSocket(SocketType.constant), true)
        // fieldInput.addControl(new TextInputControl(this.editor, field.name))
        node.addOutput(result)
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): boolean {
        const args: string[] = []
        for (let arg of this.fn.args) {
            const argNode = this.constructInNode(node, arg.name, ctx)
            if (!argNode)
                return false
            args.push(ctx.nodeId(argNode))
        }
        // TODO: handle canCopy flag
        // TODO: move operators list to core.json
        if (this.isOperator(this.fn.name) && args.length <= 2) {
            let line = `let ${ctx.nodeId(node)} = ${args[0]} ${this.fn.name}`
            if (args.length == 2)
                line += ` ${args[1]}`
            ctx.writeLine(line)
        } else
            ctx.writeLine(`let ${ctx.nodeId(node)} = ${this.fn.name}(${args.join(", ")})`)
        return true
    }

    isOperator(n: string) {
        return n == "--" || n == "++" || n == "==" || n == "!="
            || n == ">" || n == "<" || n == ">=" || n == "<=" || n == "+++" || n == "---"
            || n == "&&" || n == "||" || n == "!" || n == "*" || n == "/" || n == "%"
            || n == "+" || n == "-" || n == "&" || n == "|" || n == "^" || n == "<<" || n == ">>"
    }
}

export class Debug extends LangComponent {
    private anyType: Socket

    constructor(anyType: Socket) {
        super('Debug', ['functions'])
        this.anyType = anyType;
    }

    async builder(node) {
        this.addFlowInOut(node)
        const input = new Rete.Input('value', 'Value', this.anyType)
        node.addInput(input)
        node.addControl(new LabelControl(this.editor, 'label', true))
    }

    worker(node, inputs, outputs) {
        const val = inputs.value?.length ? inputs.value : node.data.value
        const refNode = this.editor?.nodes.find(n => n.id === node.id)
        const label = <LabelControl>refNode?.controls.get('label')
        label.setValue(val)
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'value', ctx)
        if (!inNode)
            return false
        ctx.writeLine(`debug(${ctx.nodeId(inNode)})`)
        return true
    }
}


export class If extends LangComponent {
    private conditionType: LangType

    constructor(conditionType: LangType) {
        super('If')
        this.conditionType = conditionType
    }

    async builder(node) {
        this.addFlowInOut(node)
        const onTrue = this.addFlowOut(node, 'then')
        onTrue.name = 'then'
        const onFalse = this.addFlowOut(node, 'else')
        onFalse.name = 'else'
        const input = new Rete.Input('inValue', 'Condition', this.conditionType.getSocket(SocketType.constant))
        node.addInput(input)
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'inValue', ctx)
        if (!inNode)
            return false

        ctx.writeLine(`if (${ctx.nodeId(inNode)})`)

        const indenting = ctx.indenting
        // TODO: push/pop indenting
        ctx.indenting += "\t"
        if (!this.constructDasFlowOut(node, ctx, 'then')) {
            ctx.addError(node, 'then exit expected')
            return false
        }
        ctx.indenting = indenting
        ctx.writeLine("else")
        ctx.indenting += "\t"
        if (!this.constructDasFlowOut(node, ctx, 'else'))
            ctx.writeLine('pass')
        ctx.indenting = indenting
        return true
    }
}


export class While extends LangComponent {
    private conditionType: LangType

    constructor(conditionType: LangType) {
        super('While')
        this.conditionType = conditionType
    }

    async builder(node) {
        this.addFlowInOut(node)
        const body = this.addFlowOut(node, 'body')
        body.name = 'body'
        const input = new Rete.Input('inValue', 'Condition', this.conditionType.getSocket(SocketType.constant))
        node.addInput(input)
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'inValue', ctx)
        if (!inNode)
            return false

        ctx.writeLine(`while (${ctx.nodeId(inNode)})`)

        const indenting = ctx.indenting
        // TODO: push/pop indenting
        ctx.indenting += "\t"
        if (!this.constructDasFlowOut(node, ctx, 'body'))
            return false
        ctx.indenting = indenting
        return true
    }
}

// TODO: add iterable types, Foreach components


export class Sin extends LangComponent {
    private floatType: LangType

    constructor(floatType: LangType) {
        super('Sin', ['functions'])
        this.floatType = floatType;
    }

    async builder(node) {
        const input = new Rete.Input('value', 'Value', this.floatType.getSocket(SocketType.constant))
        node.addInput(input)
        const result = new Rete.Output('result', 'Value', this.floatType.getSocket(SocketType.constRef), true)
        node.addOutput(result)
    }

    worker(node, inputs, outputs) {
        const val = inputs.value?.length ? inputs.value : node.data.value
        outputs['result'] = `sin(${val})`
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'value', ctx)
        if (!inNode)
            return false
        ctx.addReqModule('math')
        if (this.floatType.desc.canCopy)
            ctx.writeLine(`let ${ctx.nodeId(node)} = sin(${ctx.nodeId(inNode)})`)
        else
            ctx.setNodeRes(node, `sin(${ctx.nodeId(inNode)})`)
        return true
    }
}


export class Function extends LangComponent {
    constructor() {
        super('Function')
        this._topLevel = true
    }

    async builder(node) {
        this.addFlowOut(node)
        node.addControl(new LabelControl(this.editor, 'name'))
    }

    constructDas(node, ctx) {
        // TODO: create new ctx to patch fn arguments
        ctx.writeLine(`[export]\ndef ${node.data.name}()`)
        ctx.indenting += "\t"

        const res = this.constructDasFlowOut(node, ctx)
        if (!res)
            ctx.writeLine("pass")
        ctx.indenting = ""
        ctx.writeLine("")
        return true
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): boolean {
        return true
    }
}


export class ConstructDasCtx {
    get code(): string {
        if (this.requirements.size > 0) {
            for (const req of this.requirements)
                this._code = `require ${req}\n` + this._code
            this.requirements.clear()
        }
        return this._code
    }

    editor: NodeEditor
    indenting = ""
    private _code = ""
    errors = new Map<number, string[]>()
    private lazyInited = new Set<number>()
    private requirements = new Set<string>()

    private nodeResults = new Map<number, string>()

    constructor(editor: NodeEditor) {
        this.editor = editor
    }

    getChild(): ConstructDasCtx {
        let res = new ConstructDasCtx(this.editor)
        res.errors = this.errors
        res.lazyInited = this.lazyInited
        res.requirements = this.requirements
        return res
    }

    writeLine(str: string) {
        this._code += `\n${this.indenting}${str}`
    }

    addError(node: Node, msg: string) {
        if (!this.errors.has(node.id))
            this.errors.set(node.id, [msg])
        else {
            const data = this.errors.get(node.id)
            data?.push(msg)
        }
        return false
    }

    hasErrors() {
        return this.errors.size > 0
    }

    logErrors() {
        for (const [id, messages] of this.errors) {
            for (const node of this.editor.nodes) {
                if (node.id == id) {
                    console.log(`Node ${node.name}:${node.id}\n\t${messages.join('\n\t')}`)
                    break
                }
            }
        }
    }

    nodeId(node: Node): string {
        if (this.nodeResults.has(node.id)) {
            return this.nodeResults.get(node.id)!
        } else {
            return `_${node.id}`
        }
    }

    isLazyInited(node: Node): boolean {
        return this.lazyInited.has(node.id)
    }

    setIsLazyInit(node: Node) {
        this.lazyInited.add(node.id)
    }

    addReqModule(module: string) {
        this.requirements.add(module)
    }

    setNodeRes(node: Node, s: string) {
        this.nodeResults.set(node.id, s)
    }
}
