import Rete, {Engine, Input, Output, Socket} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {LabelControl, TextInputControl} from "./controls"
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
    constructor(typeDesc: LangTypeDesc, anyTypeSocket: Socket | undefined) {
        this.desc = typeDesc
        this.anyTypeSocket = anyTypeSocket
        if (typeDesc.validator)
            this.validator = new RegExp(typeDesc.validator)
    }

    readonly desc: LangTypeDesc
    readonly validator?: RegExp
    private readonly anyTypeSocket?: Socket

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

    ctor(s: string, args: { [key: string]: string }): string {
        if (!this.desc.ctor)
            return s
        const argsKeys = Object.keys(args)
        if (argsKeys.length > 0) {
            let res = this.desc.ctor
            for (const argName of argsKeys)
                res = res.replace(`\$${argName}`, args[argName])
            return res
        }
        return this.desc.ctor.replace('$', s) ?? s
    }

    supportTextInput() {
        return this.desc.validator || this.desc.ctor || this.desc.enum
    }
}

export class LangFunction {
    readonly desc: LangFunctionDesc

    constructor(desc: LangFunctionDesc) {
        this.desc = desc
    }

    ctor(args: { [key: string]: string }): string {
        if (!this.desc.ctor) {
            if (this.isOperator(this.desc.name)) {
                if (this.desc.args.length == 1)
                    return `${this.desc.name} ${args[this.desc.args[0].name]}`
                return `${args['arg0']} ${this.desc.name} ${args[this.desc.args[1].name]}`
            }

            const argsStr = this.desc.args.map(arg => args[arg.name]).join(', ')
            return `${this.desc.name}(${argsStr})`
        }
        let res = this.desc.ctor
        for (let arg of this.desc.args)
            res = res.replace(`\$${arg.name}`, args[arg.name])
        return res
    }

    // TODO: move operators list to core.json
    isOperator(n: string) {
        return n == "--" || n == "++" || n == "==" || n == "!="
            || n == ">" || n == "<" || n == ">=" || n == "<=" || n == "+++" || n == "---"
            || n == "&&" || n == "||" || n == "!" || n == "*" || n == "/" || n == "%"
            || n == "+" || n == "-" || n == "&" || n == "|" || n == "^" || n == "<<" || n == ">>"
    }
}


const allTypes = new Map</*mn*/string, LangType>()
const allFunctions = new Array<LangFunction>()


function getType(mn: string): LangType | undefined {
    return allTypes.get(mn)
}


function getBaseType(mn: string): LangType | undefined {
    const res = getType(mn)
    if (res && res.desc.baseMn)
        return getType(res.desc.baseMn) ?? res
    return res
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
    const coreTypes = new Map</*mn*/string, LangTypeDesc>()
    for (const typeDesc of langCore.types ?? [])
        coreTypes.set(typeDesc.mn, typeDesc)

    const logicTypeName = langCore.logicType
    const anyTypeName = langCore.anyType
    const voidTypeName = langCore.voidType
    const anyTypeSocket = anyTypeName ? new Rete.Socket(anyTypeName) : undefined

    const comps: Component[] = []
    if (anyTypeSocket)
        comps.push(new Debug(anyTypeSocket))
    comps.push(new Function())

    for (const typeDesc of lang.types ?? []) {
        if (allTypes.has(typeDesc.mn)) {
            console.error(`type ${typeDesc.mn} already exists`)
        }
        const coreType = coreTypes.get(typeDesc.mn)
        const mergeTypeDesc = coreType ? Object.assign({}, typeDesc, coreType) : typeDesc
        const type = new LangType(mergeTypeDesc, anyTypeSocket)
        allTypes.set(typeDesc.mn, type)

        if (typeDesc.mn == logicTypeName)
            comps.push(new If(type), new While(type))
    }

    for (const coreType of coreTypes.values()) {
        if (coreType.mn == anyTypeName || coreType.mn == voidTypeName)
            continue
        const type = allTypes.get(coreType.mn)
        if (type?.supportTextInput())
            comps.push(new TypeCtor(type.desc.typeName, ["ctors", type.desc.typeName], type))
    }

    for (const func of lang.functions ?? []) {
        const langFunction = new LangFunction(func)
        allFunctions.push(langFunction)
        const resType = getType(func.resMn)
        if (!resType) {
            console.error(`function ${func.name} has unknown result type ${func.resMn}`)
            continue
        }
        const group: string[] = []
        if (func.resMn != voidTypeName && func.resMn != anyTypeName && resType.desc.typeName == func.name) {
            group.push("ctors", resType.desc.typeName)
        } else {
            const typeName = resType.desc.typeName
            group.push('functions', typeName.substring(0, 2), typeName, func.name.substring(0, 1))
        }
        const fn = new LangFunc(func.mn, group, langFunction, resType)
        comps.push(fn)
    }

    for (const func of langCore.functions ?? []) {
        const langFunction = new LangFunction(func)
        allFunctions.push(langFunction)
        const resType = getType(func.resMn)
        if (!resType) {
            console.error(`function ${func.name} has unknown result type ${func.resMn}`)
            continue
        }
        const fn = new LangFunc(func.mn, ['core'], langFunction, resType)
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
        ctx.addProcessedNode(node)
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


export class TypeCtor extends LangComponent {
    private readonly baseType: LangType
    private readonly useLocal: boolean

    constructor(name: string, group: string[], type: LangType) {
        super(name, group)
        this.baseType = type
        this.useLocal = this.baseType.desc.canCopy ?? false
    }

    async builder(node) {
        const out = new Rete.Output('result', 'Result', this.baseType.getSocket(SocketType.constRef), this.useLocal)
        node.addOutput(out)
        const inputControl = new TextInputControl(this.editor, 'value')
        inputControl.validator = this.baseType.validator
        inputControl.defaultValue = this.baseType.desc.default ?? ""
        node.data['value'] ??= this.baseType.desc.default
        node.addControl(inputControl)
    }

    worker(node, inputs, outputs) {
        const ctorArgs: { [key: string]: string } = {}
        const nodeRef = this.editor?.nodes.find(n => n.id == node.id)
        if (nodeRef) {
            const valueInput = <TextInputControl>nodeRef.controls.get('value')
            if (valueInput && valueInput.values != this.baseType.desc.enum) {
                valueInput.values = this.baseType.desc.enum
                valueInput.setValue(node.data['value'])
            }
        }

        outputs['result'] = this.baseType.ctor(inputs.value?.length ? inputs.value : node.data.value, ctorArgs)
    }

    constructDasNode(node, ctx) {
        const ctorArgs: { [key: string]: string } = {}

        for (const req in this.baseType.desc.requirements)
            ctx.addReqModule(req)

        const val = this.baseType.ctor(node.data.value, ctorArgs)
        // if (this.useLocal && (node.outputs.get('result')?.connections.length ?? 0) > 1)
        if (this.useLocal)
            ctx.writeLine(`let ${ctx.nodeId(node)} = ${val}`)
        else
            ctx.setNodeRes(node, val)
        return true
    }
}


export class LangFunc extends LangComponent {
    private readonly resType: LangType
    private readonly ctorFn: LangFunction
    private readonly useLocal: boolean

    constructor(name: string, group: string[], ctorFn: LangFunction, type: LangType) {
        super(name, group)
        this.resType = type
        this.ctorFn = ctorFn
        this.useLocal = this.resType.desc.canCopy ?? false
    }

    async builder(node) {
        const out = new Rete.Output('result', 'Result', this.resType.getSocket(SocketType.constRef), this.useLocal)
        if (this.ctorFn.desc.sideeffect)
            this.addFlowInOut(node)
        node.addOutput(out)
        for (const field of this.ctorFn.desc.args) {
            const fieldType = getBaseType(field.mn)
            if (!fieldType) {
                console.error(`type ${field.mn} not found`)
                continue
            }
            node.data[field.name] ??= fieldType.desc.default
            const fieldInput = new Rete.Input(field.name, field.name, fieldType.getSocket(SocketType.constant), false)
            if (fieldType.supportTextInput()) {
                const inputControl = new TextInputControl(this.editor, field.name)
                inputControl.validator = fieldType.validator
                inputControl.defaultValue = fieldType.desc.default ?? ""
                fieldInput.addControl(inputControl)
            }
            node.addInput(fieldInput)
        }
    }

    worker(node, inputs, outputs) {
        const nodeRef = this.editor?.nodes.find(n => n.id == node.id)
        if (nodeRef) {
            for (const field of this.ctorFn.desc.args) {
                const fieldInput = nodeRef.inputs.get(field.name)
                const inputControl = <TextInputControl>fieldInput?.control
                if (!inputControl)
                    continue
                const fieldType = getBaseType(field.mn)
                if (inputControl.values != fieldType!.desc.enum) {
                    inputControl.values = fieldType!.desc.enum
                    inputControl.setValue(node.data[field.name])
                }
            }
        }

        const ctorArgs: { [key: string]: string } = {}
        for (const field of this.ctorFn.desc.args)
            ctorArgs[field.name] = inputs[field.name]?.length ? inputs[field.name] : node.data[field.name]

        outputs['result'] = this.ctorFn.ctor(ctorArgs)
    }

    constructDasNode(node, ctx) {
        const ctorArgs: { [key: string]: string } = {}
        for (const field of this.ctorFn.desc.args) {
            const input = this.constructOptionalInNode(node, field.name, ctx)
            if (input) {
                ctorArgs[field.name] = ctx.nodeId(input)
                continue
            }
            const fieldType = getType(field.mn)
            if (fieldType) {
                for (const req of fieldType.desc.requirements ?? [])
                    ctx.addReqModule(req)
                if (fieldType.desc.isConst && !fieldType.desc.isRef) {
                    const baseType = getBaseType(field.mn)
                    // ignore base type ctors with same name
                    if (baseType && (this.ctorFn.desc.args.length != 1 || baseType.desc.typeName != this.ctorFn.desc.name)) {
                        ctorArgs[field.name] = baseType.ctor(node.data[field.name], {}) ?? node.data[field.name]
                        continue
                    }
                }
                ctorArgs[field.name] = fieldType.ctor(node.data[field.name], {}) ?? node.data[field.name]
                continue
            }
            ctorArgs[field.name] = node.data[field.name]
        }
        for (const req in this.resType.desc.requirements)
            ctx.addReqModule(req)

        const val = this.ctorFn.ctor(ctorArgs)
        // if (this.useLocal && (node.outputs.get('result')?.connections.length ?? 0) > 1)
        if (this.useLocal)
            ctx.writeLine(`let ${ctx.nodeId(node)} = ${val}`)
        else
            ctx.setNodeRes(node, val)
        return true
    }
}


export class Debug extends LangComponent {
    private readonly anyType: Socket

    constructor(anyType: Socket) {
        super('Debug', ['language'])
        this.anyType = anyType
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
        ctx.reqNode(inNode)
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

    editor: NodeEditor
    indenting = ""
    code = ""
    errors = new Map<number, string[]>()
    private lazyInited = new Set<number>()
    private requirements = new Set<string>()

    private nodeResults = new Map<number, string>()
    private processedNodes = new Set<number>()
    private requiredNodes = new Set<number>()

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

    writeLine(str: string): void {
        this.code += `\n${this.indenting}${str}`
    }

    addError(node: Node, msg: string): boolean {
        return this.addErrorId(node.id, msg)
    }

    addErrorId(id: number, msg: string): boolean {
        if (!this.errors.has(id))
            this.errors.set(id, [msg])
        else {
            const data = this.errors.get(id)
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

    reqNode(node: Node) {
        this.requiredNodes.add(node.id)
    }

    addProcessedNode(node: Node) {
        this.processedNodes.add(node.id)
    }

    build() {
        if (this.requirements.size > 0) {
            for (const req of this.requirements)
                this.code = `require ${req}\n` + this.code
            this.requirements.clear()
        }
        for (const it of this.processedNodes)
            this.requiredNodes.delete(it)
        for (let requiredNode of this.requiredNodes) {
            this.addErrorId(requiredNode, "Node is not processed")
        }
    }
}
