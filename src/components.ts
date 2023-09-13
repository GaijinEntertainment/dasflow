import Rete, {Engine, Input, Output, Socket} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {LabelControl, LangTypeSelectControl, MultilineLabelControl, NumControl, TextInputControl} from "./controls"
import {LangCoreDesc, LangDesc, LangFunctionDesc, LangTypeDesc} from "./lang"
import {Component} from "rete/types"
import { CompileError } from './rpc'


const optimizeFlow = true

const flowSocket = new Rete.Socket('exec-flow')


class LangCtx {
    allTypes = new Map</*mn*/string, LangType>()
    allFunctions = new Array<LangFunction>()
    anyType: LangType
    logicType: LangType

    getType(mn: string): LangType | undefined {
        return this.allTypes.get(mn)
    }
}


class LangSocket extends Socket {
    typeName: string
    isAny: boolean

    constructor(typeName: string, isAny: boolean) {
        super(typeName)
        this.typeName = typeName
        this.isAny = isAny;
    }

    compatibleWith(socket: Socket): boolean {
        if (this === socket)
            return true
        if (socket instanceof LangSocket) {
            if (socket.isAny)
                return true
            return socket.typeName == this.typeName
        }
        return false
    }
}


export class LangType {
    constructor(typeDesc: LangTypeDesc, isVoid: boolean, isAny: boolean) {
        this.desc = typeDesc
        if (typeDesc.validator)
            this.validator = new RegExp(typeDesc.validator)
        this.isVoid = isVoid
        this.isAny = isAny
        this.socket = new LangSocket(this.desc.baseMn ?? this.desc.mn, this.isAny)
    }

    readonly desc: LangTypeDesc
    readonly isVoid: boolean
    readonly isAny: boolean;
    readonly validator?: RegExp

    readonly socket: LangSocket

    getSocket(): LangSocket {
        return this.socket
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

    static validate(desc: LangFunctionDesc, langCtx: LangCtx): boolean {
        for (const arg of desc.args) {
            const argType = langCtx.getType(arg.mn)
            if (!argType) {
                console.error(`Function's ${desc.name} argument ${arg.name} with unknown type ${arg.mn}`)
                return false
            }
            if (argType.isVoid) {
                console.error(`Function's ${desc.name} argument ${arg.name} is void`)
                return false
            }
        }
        const resType = langCtx.getType(desc.resMn)
        if (!resType) {
            console.error(`function ${desc.name} has unknown result type ${desc.resMn}`)
            return false
        }
        return true
    }

    ctor(args: { [key: string]: string }): string {
        if (!this.desc.ctor) {
            const argsStr = this.desc.args.map(arg => args[arg.name]).join(', ')
            return `${this.desc.name}(${argsStr})`
        }
        let res = this.desc.ctor
        for (let arg of this.desc.args)
            res = res.replace(`\$${arg.name}`, args[arg.name])
        return res
    }
}


export function generateCoreNodes(langCore: LangCoreDesc, lang: LangDesc, editor: NodeEditor, engine: Engine) {
    const langCtx = new LangCtx()
    const coreTypes = new Map</*mn*/string, LangTypeDesc>()
    for (const typeDesc of langCore.types ?? [])
        coreTypes.set(typeDesc.mn, typeDesc)

    for (const typeDesc of lang.types ?? []) {
        if (langCore.anyTypes.indexOf(typeDesc.mn) >= 0) {
            const type = new LangType(typeDesc, langCore.voidTypes.indexOf(typeDesc.mn) >= 0, true)
            langCtx.allTypes.set(typeDesc.mn, type)
            break
        }
    }

    const comps: Component[] = [new InjectTopLevelCode(), new InjectCode(), new Sequence(), new Var(langCtx),
        new Function(langCtx), new If(langCtx), new While(langCtx)]

    for (const typeDesc of lang.types ?? []) {
        if (langCore.anyTypes.indexOf(typeDesc.mn) >= 0)
            continue
        if (langCtx.allTypes.has(typeDesc.mn)) {
            console.error(`type ${typeDesc.mn} already exists`)
        }
        const coreType = !typeDesc.isRef && typeDesc.baseMn ? coreTypes.get(typeDesc.baseMn) ?? coreTypes.get(typeDesc.mn) : coreTypes.get(typeDesc.mn)
        const mergeTypeDesc = coreType ? Object.assign({}, typeDesc, coreType) : typeDesc
        const type = new LangType(mergeTypeDesc, langCore.voidTypes.indexOf(typeDesc.mn) >= 0, false)
        langCtx.allTypes.set(typeDesc.mn, type)

        if (typeDesc.mn == langCore.logicType)
            langCtx.logicType = type
    }

    for (const coreType of coreTypes.values()) {
        if (langCore.voidTypes.indexOf(coreType.mn) >= 0 || langCore.anyTypes.indexOf(coreType.mn) >= 0)
            continue
        const type = langCtx.allTypes.get(coreType.mn)
        if (type?.supportTextInput())
            comps.push(new TypeCtor(type.desc.typeName, ["ctors", type.desc.typeName], type))
    }

    for (const func of lang.functions ?? []) {
        if (!LangFunction.validate(func, langCtx))
            continue
        const langFunction = new LangFunction(func)
        const resType = langCtx.getType(func.resMn)
        if (!resType)
            continue
        langCtx.allFunctions.push(langFunction)
        const group: string[] = []
        if (langCore.voidTypes.indexOf(func.resMn) < 0 && langCore.anyTypes.indexOf(func.resMn) < 0 && resType.desc.typeName == func.name) {
            group.push("ctors", resType.desc.typeName)
        } else {
            const typeName = resType.desc.typeName
            group.push('functions', typeName.substring(0, 2), func.args.length.toString(), typeName, func.name.substring(0, 1))
        }
        const fn = new LangFunc(func.mn, group, langFunction, resType, langCtx)
        comps.push(fn)
    }

    for (const func of langCore.functions ?? []) {
        if (!LangFunction.validate(func, langCtx))
            continue
        const langFunction = new LangFunction(func)
        const resType = langCtx.getType(func.resMn)
        if (!resType)
            continue
        langCtx.allFunctions.push(langFunction)
        const fn = new LangFunc(func.mn, ['core'], langFunction, resType, langCtx)
        comps.push(fn)
    }

    for (const type of langCtx.allTypes.values()) {
        if (type.isAny) {
            langCtx.anyType = type
            break
        }
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

    constructDas(node: Node, ctx: ConstructDasCtx): void {
        ctx.addProcessedNode(node)
        this.constructDasNode(node, ctx)
        if (this.flowOut)
            LangComponent.constructDasFlowOut(node, ctx)
    }


    abstract constructDasNode(node: Node, ctx: ConstructDasCtx): void


    static constructOptionalInNode(node: Node, name: string, ctx: ConstructDasCtx): Node | null {
        const inValue = node.inputs.get(name)
        if (!inValue || inValue.connections.length == 0) {
            return null
        }
        const inNode = inValue.connections[0].output.node
        if (!inNode) {
            return null
        }
        if (inNode.name == "Function") {
            const i = inValue.connections[0].output.key[3];

            const inChildNode = LangComponent.constructOptionalInNode(inNode, `arg${i}`, ctx)
            return inChildNode
        }

        LangComponent.constructAutoInit(inNode, ctx)
        ctx.reqNode(inNode)
        return inNode
    }

    static constructInNode(node: Node, name: string, ctx: ConstructDasCtx): Node | null {
        const inNode = LangComponent.constructOptionalInNode(node, name, ctx)
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


    static constructDasFlowOut(node: Node, ctx: ConstructDasCtx, key = 'fout'): boolean {
        const out = node.outputs.get(key)
        if (!out || out.connections.length == 0)
            return false
        const nextNode = out.connections[0].input.node
        if (!nextNode)
            return false
        const component = <LangComponent>ctx.editor.components.get(nextNode.name)
        component.constructDas(nextNode, ctx)
        return true
    }
}


export class TypeCtor extends LangComponent {
    private readonly baseType: LangType
    private readonly useLocal: boolean

    constructor(name: string, group: string[], type: LangType) {
        super(name, group)
        this.baseType = type
        this.useLocal = this.baseType.desc.isLocal ?? false
    }

    async builder(node) {
        const out = new Rete.Output('result', 'Result', this.baseType.getSocket(), this.useLocal)
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

    constructDasNode(node, ctx): void {
        const ctorArgs: { [key: string]: string } = {}

        for (const req of this.baseType.desc.requirements ?? [])
            ctx.addReqModule(req)

        const val = this.baseType.ctor(node.data.value, ctorArgs)

        let outConnectionsNum = node.outputs.get('result')?.connections.length ?? 0
        const firstOutNode = node.outputs.get('result').connections[0].input.node

        if (!(outConnectionsNum == 1 && firstOutNode.name == "Function")) {
            if (this.useLocal && (!optimizeFlow || outConnectionsNum > 1))
                ctx.writeLine(node, `let ${ctx.nodeId(node)} = ${val}`)
            else
                ctx.setNodeRes(node, val)
        }
    }
}


export class LangFunc extends LangComponent {
    private readonly resType: LangType
    private readonly ctorFn: LangFunction
    private readonly useLocal: boolean
    private readonly langCtx: LangCtx

    constructor(name: string, group: string[], ctorFn: LangFunction, type: LangType, langCtx: LangCtx) {
        super(name, group)
        this.resType = type
        this.ctorFn = ctorFn
        this.langCtx = langCtx
        this.useLocal = this.resType.desc.isLocal ?? false
    }

    async builder(node) {
        if (!this.resType.isVoid) {
            const out = new Rete.Output('result', 'Result', this.resType.getSocket(), this.useLocal)
            node.addOutput(out)
        }
        if (this.ctorFn.desc.sideeffect)
            this.addFlowInOut(node)
        for (const field of this.ctorFn.desc.args) {
            const fieldType = this.langCtx.getType(field.mn)
            if (!fieldType) {
                console.error(`type ${field.mn} not found`)
                continue
            }
            node.data[field.name] ??= fieldType.desc.default
            const fieldInput = new Rete.Input(field.name, field.name, fieldType.getSocket(), false)
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
                const fieldType = this.langCtx.getType(field.mn)
                if (inputControl.values != fieldType!.desc.enum) {
                    inputControl.values = fieldType!.desc.enum
                    inputControl.setValue(node.data[field.name])
                }
            }
        }
        // if (!this.resType.isVoid) {
        //     const ctorArgs: { [key: string]: string } = {}
        //     for (const field of this.ctorFn.desc.args)
        //         ctorArgs[field.name] = inputs[field.name]?.length ? inputs[field.name] : node.data[field.name]
        //
        //     outputs['result'] = this.ctorFn.ctor(ctorArgs)
        // }
    }

    constructDasNode(node, ctx) {
        const ctorArgs: { [key: string]: string } = {}
        for (const field of this.ctorFn.desc.args) {
            const fieldType = this.langCtx.getType(field.mn)
            if (!fieldType) {
                console.error(`type ${field.mn} not found`)
                continue
            }
            const input = fieldType.supportTextInput() ? LangComponent.constructOptionalInNode(node, field.name, ctx) : LangComponent.constructInNode(node, field.name, ctx)
            if (input) {
                ctorArgs[field.name] = ctx.nodeId(input)
                continue
            }

            for (const req of fieldType.desc.requirements ?? [])
                ctx.addReqModule(req)
            if (this.ctorFn.desc.args.length != 1 || fieldType.desc.typeName != this.ctorFn.desc.name) {
                ctorArgs[field.name] = fieldType.ctor(node.data[field.name], {}) ?? node.data[field.name]
                continue
            }
            ctorArgs[field.name] = fieldType.ctor(node.data[field.name], {}) ?? node.data[field.name]
        }
        for (const req of this.resType.desc.requirements ?? [])
            ctx.addReqModule(req)
        for (const req of this.ctorFn.desc.requirements ?? [])
            ctx.addReqModule(req)

        const val = this.ctorFn.ctor(ctorArgs)
        const outConnectionsNum = node.outputs.get('result')?.connections.length ?? 0
        if (this.useLocal && (!optimizeFlow || this.ctorFn.desc.sideeffect || outConnectionsNum > 1)) {
            if (this.resType.isVoid || outConnectionsNum == 0)
                ctx.writeLine(node, val)
            else
                ctx.writeLine(node, `let ${ctx.nodeId(node)} = ${val}`)
        } else
            ctx.setNodeRes(node, val)
    }
}


export class If extends LangComponent {
    private readonly langCtx: LangCtx

    constructor(langCtx: LangCtx) {
        super('If')
        this.langCtx = langCtx
    }

    async builder(node) {
        this.addFlowInOut(node)
        const onTrue = this.addFlowOut(node, 'then')
        onTrue.name = 'then'
        const onFalse = this.addFlowOut(node, 'else')
        onFalse.name = 'else'
        const input = new Rete.Input('inValue', 'Condition', this.langCtx.logicType.getSocket())
        node.addInput(input)
    }

    constructDasNode(node, ctx) {
        const inNode = LangComponent.constructInNode(node, 'inValue', ctx)
        if (!inNode)
            return false

        ctx.writeLine(node, `if (${ctx.nodeId(inNode)})`)

        const thenChildCtx = ctx.getChild()
        if (!LangComponent.constructDasFlowOut(node, thenChildCtx, 'then'))
            ctx.addError(node, 'then exit expected')
        ctx.closeChild(thenChildCtx)

        const elseChildCtx = ctx.getChild()
        if (LangComponent.constructDasFlowOut(node, elseChildCtx, 'else')) {
            ctx.writeLine(node, "else")
            ctx.closeChild(elseChildCtx)
        }
    }
}


export class While extends LangComponent {
    private readonly langCtx: LangCtx

    constructor(langCtx: LangCtx) {
        super('While')
        this.langCtx = langCtx
    }

    async builder(node) {
        this.addFlowInOut(node)
        const body = this.addFlowOut(node, 'body')
        body.name = 'body'
        const input = new Rete.Input('inValue', 'Condition', this.langCtx.logicType.getSocket())
        node.addInput(input)
    }

    constructDasNode(node, ctx) {
        const inNode = LangComponent.constructInNode(node, 'inValue', ctx)
        if (!inNode)
            return

        ctx.writeLine(node, `while (${ctx.nodeId(inNode)})`)

        const childCtx = ctx.getChild()
        if (LangComponent.constructDasFlowOut(node, childCtx, 'body'))
            ctx.closeChild(childCtx)
        else
            ctx.writeLine(node, 'pass')
    }
}


export class Function extends LangComponent {
    private readonly langCtx: LangCtx

    constructor(langCtx: LangCtx) {
        super('Function')
        this.langCtx = langCtx
        this._topLevel = true
    }

    async builder(node) {
        this.addFlowOut(node)
        node.addControl(new LabelControl(this.editor, 'name'))

        node.addControl(new NumControl(this.editor, 'numArgs'))

        const numArgs = node.data.numArgs ?? 0
        for (let i = 0; i < numArgs; i++) {
            this.addArgInput(node, i)
            this.addArgOutput(node, i)
        }
    }

    private addArgInput(node, i: number) {
        const argInput = new Rete.Input(`arg${i}`, `Argument ${i + 1}`, this.langCtx.anyType.getSocket(), false)
        argInput.addControl(new LangTypeSelectControl(this.editor, 'typeName', this.langCtx.allTypes))
        node.addInput(argInput)
    }

    private addArgOutput(node, i: number) {
        const type = node.data.typeName[i] ? this.langCtx.getType(node.data.typeName[i]) ?? this.langCtx.anyType : this.langCtx.anyType
        const argOutput = new Rete.Output(`out${i}`, `Output ${i + 1}`, type.getSocket(), true)
        node.addOutput(argOutput)
    }

    private getInType(node, argInput, i: number) {
        let inType: LangType | undefined
        if (argInput) {
            if (argInput.showControl()) {
                node.data.typeName[i] = this.langCtx.anyType.getSocket().typeName
                inType = this.langCtx.anyType
            } else {
                const connection = argInput.connections[0]
                inType = this.langCtx.getType((<LangSocket>connection.output.socket).typeName)
                if (inType && !inType.desc.isLocal && !inType.isAny) {
                    inType = this.langCtx.anyType
                    this.editor?.removeConnection(connection)
                }
            }
        }
        return inType
    }

    private setOutType(node, inType, nodeRef, i: number) {
        const result = nodeRef.outputs.get(`out${i}`)
            if (result) {
                const prevSocket = result.socket
                result.socket = (inType ?? this.langCtx.anyType).getSocket()
                if (prevSocket != result.socket) {
                    for (const connection of [...result.connections]) {
                        if (!connection.output.socket.compatibleWith(connection.input.socket))
                            this.editor?.removeConnection(connection)
                    }
                }
                node.data.typeName[i] = (<LangSocket>result.socket).typeName
            }
    }

    private controleNumArgs(node, nodeRef, numArgs, reqNumArgs) {
        if (!this.editor)
            return false

        if (numArgs < reqNumArgs) {
            for (let i = numArgs; i < reqNumArgs; i++) {
                this.addArgInput(nodeRef, i)
                this.addArgOutput(nodeRef, i)
                node.data.typeName.push(this.langCtx.anyType.getSocket().typeName)
            }
            return true
        } else if (numArgs > reqNumArgs) {
            for (let i = reqNumArgs; i < numArgs; i++) {
                const argInput = nodeRef.inputs.get(`arg${i}`)
                if (argInput) {
                    for (const conn of [...argInput.connections])
                        this.editor.removeConnection(conn)
                    nodeRef.removeInput(argInput)
                }
                const argOutput = nodeRef.outputs.get(`out${i}`)
                if (argOutput) {
                    for (const conn of [...argOutput.connections])
                        this.editor.removeConnection(conn)
                    nodeRef.removeOutput(argOutput)
                }
                node.data.typeName.pop()
            }
            return true
        }
        return false
    }

    worker(node, inputs, outputs) {
        if (!this.editor)
            return
        const nodeRef = this.editor.nodes.find(it => it.id == node.id)
        if (!nodeRef)
            return
        let updateNode = false
        const reqNumArgs = node.data.numArgs ?? 0
        outputs['numArgs'] = reqNumArgs
        const argsInput = <NumControl>nodeRef.controls.get('numArgs')
        if (argsInput)
            argsInput.setValue(reqNumArgs)
        const numArgs = Math.max(0, nodeRef?.inputs.size ?? 0 - 1)

        updateNode = this.controleNumArgs(node, nodeRef, numArgs, reqNumArgs)

        for (let i = 0; i < reqNumArgs; i++) {
            let inType: LangType | undefined
            const argInput = nodeRef.inputs.get(`arg${i}`)
            inType = this.getInType(node, argInput, i)

            this.setOutType(node, inType, nodeRef, i)
            updateNode = true
        }
        if (updateNode)
            nodeRef.update()
    }

    constructDas(node, ctx): void {
        let args = new Array<string>()
        const numArgs = node.data.numArgs ?? 0
        const argNames = new Set<string>()
        for (let i = 0; i < numArgs; i++) {
            let inNode = LangComponent.constructOptionalInNode(node, `arg${i}`, ctx)
            if (!inNode)
                continue // constructInNode adds an error

            let childStr

            const argName = ctx.nodeId(inNode)
            if (argNames.has(argName))
                ctx.addError(node, `Duplicate argument name: ${argName}`)
            argNames.add(argName)

            const component = <LangComponent>ctx.editor.components.get(inNode.name)
            if (!(component instanceof TypeCtor))
                ctx.addError(node, `Unsupported argument type: ${inNode.name}`)

            const connectionsNum = inNode.outputs.get(`result`)?.connections.length ?? 0
            if (connectionsNum > 1) {
                childStr = `${ctx.nodeId(inNode)}`
            } else {
                const argInput = this.editor?.nodes.find(it => it.id == node.id)?.inputs.get(`arg${i}`)
                if (!argInput)
                    continue

                const connection = argInput.connections[0]
                const type = this.langCtx.getType((<LangSocket>connection.output.socket).typeName)

                if (type) {
                    const ctorArgs: { [key: string]: string } = {}
                    const string_value = String(inNode.data.value)

                    const val = type.ctor(string_value, ctorArgs)
                    childStr = `${ctx.nodeId(inNode)} = ${val}`
                }
            }

            args.push(childStr)
        }

        // TODO: add func annotations
        ctx.writeLine(node, `[export]\ndef ${node.data.name}(${args.join('; ')})`)
        const childCtx = ctx.getChild()
        if (LangComponent.constructDasFlowOut(node, childCtx))
            ctx.closeChild(childCtx)
        else
            ctx.writeLine(node, "pass")
        ctx.writeLine(node, "")
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): void {
    }
}


export abstract class Identifier extends LangComponent {
    protected readonly langCtx: LangCtx

    protected constructor(name: string, langCtx: LangCtx) {
        super(name)
        this.langCtx = langCtx
    }

    async builder(node) {
        const type = node.data.typeName ? this.langCtx.getType(node.data.typeName) ?? this.langCtx.anyType : this.langCtx.anyType
        const out = new Rete.Output('result', 'Result', type.getSocket(), true)
        node.addOutput(out)
        const input = new Rete.Input('value', 'Value', this.langCtx.anyType.getSocket())
        input.addControl(new LangTypeSelectControl(this.editor, 'typeName', this.langCtx.allTypes))
        node.addInput(input)
    }

    worker(node, inputs, outputs) {
        const nodeRef = this.editor?.nodes.find(it => it.id == node.id)
        if (!nodeRef)
            return
        const input = nodeRef.inputs.get('value')
        let updateNode = false
        let inType: LangType | undefined
        if (input) {
            if (input.showControl()) {
                inType = this.langCtx.getType(node.data.typeName) ?? this.langCtx.anyType
            } else {
                const connection = input.connections[0]
                inType = this.langCtx.getType((<LangSocket>connection.output.socket).typeName)
                if (inType && !inType.desc.isLocal && !inType.isAny) {
                    // TODO: show error, cannot assign to !isLocal type
                    inType = this.langCtx.anyType
                    this.editor?.removeConnection(connection)
                    updateNode = true
                }
            }
        }
        const result = nodeRef.outputs.get('result')
        if (result) {
            const prevSocket = result.socket
            result.socket = (inType ?? this.langCtx.anyType).getSocket()
            if (prevSocket != result.socket) {
                for (const connection of [...result.connections]) {
                    if (!connection.output.socket.compatibleWith(connection.input.socket))
                        this.editor?.removeConnection(connection)
                }
                updateNode = true
            }
            node.data.typeName = (<LangSocket>result.socket).typeName
        }
        if (updateNode)
            nodeRef.update()
    }

    constructDasNode(node, ctx): void {
    }
}


export class Var extends Identifier {

    constructor(langCtx: LangCtx) {
        super('Variable', langCtx)
    }

    constructDasNode(node, ctx): void {
        const inNode = LangComponent.constructOptionalInNode(node, 'value', ctx)
        if (inNode)
            ctx.writeLine(node, `var ${ctx.nodeId(node)} = ${ctx.nodeId(inNode)}`)
        else
            ctx.writeLine(node, `var ${ctx.nodeId(node)}: ${this.langCtx.getType(<string>node.data.typeName)?.desc.typeName}`)
    }
}


export class InjectTopLevelCode extends LangComponent {
    constructor() {
        super('InjectTopLevelCode')
        this._topLevel = true
    }

    async builder(node) {
        this.addFlowOut(node)
        node.addControl(new MultilineLabelControl(this.editor, 'code'))
    }

    constructDas(node, ctx): void {
        if (node.data.code) {
            const code = <string>node.data.code
            for (let string of code.split("\n"))
                ctx.writeLine(node, string)
        }

        const childCtx = ctx.getChild()
        if (LangComponent.constructDasFlowOut(node, childCtx))
            ctx.closeChild(childCtx)
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): void {
    }
}


export class InjectCode extends LangComponent {
    constructor() {
        super('InjectCode')
    }

    async builder(node) {
        this.addFlowInOut(node)
        node.addControl(new MultilineLabelControl(this.editor, 'code'))
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): void {
        if (node.data.code) {
            const code = <string>node.data.code
            for (let string of code.split("\n"))
                ctx.writeLine(node, string)
        }
    }
}


export class Sequence extends LangComponent {
    constructor() {
        super('Sequence')
    }

    async builder(node) {
        this.addFlowIn(node)
        node.addControl(new NumControl(this.editor, 'numExits'))
        const reqNumExits = node.data.numExits ?? 0
        for (let i = 0; i < reqNumExits; i++)
            Sequence.addOutput(node, i)
    }

    private static addOutput(node: Node, i: number) {
        const out = new Rete.Output(`out${i}`, `Output ${i + 1}`, flowSocket, false)
        node.addOutput(out)
    }

    worker(node, inputs, outputs) {
        if (!this.editor)
            return
        const nodeRef = this.editor.nodes.find(it => it.id == node.id)
        if (!nodeRef)
            return
        const reqNumExits = node.data.numExits ?? 0
        outputs['numExits'] = reqNumExits
        const exitsInput = <NumControl>nodeRef.controls.get('numExits')
        if (exitsInput)
            exitsInput.setValue(reqNumExits)
        const numExits = nodeRef?.outputs.size ?? 0 - 1
        if (numExits == reqNumExits)
            return
        if (numExits < reqNumExits) {
            for (let i = numExits; i < reqNumExits; i++)
                Sequence.addOutput(nodeRef, i)
            nodeRef.update()
        } else {
            for (let i = reqNumExits; i < numExits; i++) {
                const out = nodeRef.outputs.get(`out${i}`)
                if (out) {
                    for (const conn of [...out.connections])
                        this.editor.removeConnection(conn)
                    nodeRef.removeOutput(out)
                }
            }
            nodeRef.update()
        }
    }

    constructDasNode(node: Node, ctx: ConstructDasCtx): void {
        for (let i = 0; i < node.outputs.size; ++i)
            LangComponent.constructDasFlowOut(node, ctx, `out${i}`)
    }
}


export class ConstructDasCtx {
    get code(): string {
        return this._code;
    }

    get indenting(): string {
        return this._indenting;
    }

    readonly editor: NodeEditor
    private _indenting = ""
    private _code = ""
    errors = new Map<number, string[]>()
    private lazyInited = new Set<number>()
    private requirements = new Set<string>()

    private nodeResults = new Map<number, string>()
    private processedNodes = new Set<number>()
    private requiredNodes = new Set<number>()
    private lineToNode = new Map<number, number>()
    private linesCount = 2

    constructor(editor: NodeEditor) {
        this.editor = editor
    }

    getChild(extraIndent = '\t'): ConstructDasCtx {
        let res = new ConstructDasCtx(this.editor)
        res._indenting = this._indenting + extraIndent
        res.errors = this.errors
        res.lazyInited = this.lazyInited
        res.requirements = this.requirements
        res.nodeResults = this.nodeResults
        res.processedNodes = this.processedNodes
        res.requiredNodes = this.requiredNodes
        return res
    }

    writeLine(node: Node, str: string): void {
        this._code += `${this._indenting}${str}\n`
        this.lineToNode.set(node.id, this.linesCount)
        this.linesCount += str.split('\n').length
    }

    addError(node: Node, msg: string): boolean {
        return this.addErrorId(node.id, msg)
    }

    addNativeErrors(errors: CompileError[], thisFile: string) {
         for (const error of errors) {
            const strFile = String(error.file.split('/').slice(-1))
            if (strFile == thisFile) {
                let isFound = false

                for (const [id, line] of this.lineToNode) {
                    if (line == error.line) {
                        this.addErrorId(id, error.message)
                        const node = this.editor.nodes.find(n => n.id == id)
                        const error_text = '\u00A0' + '\u00A0' + error.message  +
                                            (error.fixme == '' ? '' : '\nfixme: ' + error.fixme) +
                                            (error.extra == '' ? '' : '\nextra: ' + error.extra)
                        // @ts-ignore
                        this.editor?.trigger('addcomment', ({ type: 'inline', text: error_text, position: node.position }))
                        isFound = true
                        break
                    }
                }
                if (!isFound) {
                    this.addGlobalError(error.message)
                }
            }
        }
    }

    addGlobalError(msg: string) {
        const global_text = '\u00A0\u00A0' + 'Global error:\n\t' + msg
        console.log(global_text)
        // @ts-ignore
        this.editor?.trigger('addcomment', ({ type: 'inline', text: global_text, position: [0, 0] }))
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
                    // @ts-ignore
                    this.editor?.trigger('addcomment', ({ type: 'inline', text: '\u00A0' + messages, position: node.position }))
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
        if (this.requirements.size > 0)
            this._code = "\n\n" + this._code
        for (const req of this.requirements)
            this._code = `require ${req}\n` + this._code
        this.requirements.clear()
        for (const it of this.processedNodes)
            this.requiredNodes.delete(it)
        for (let requiredNode of this.requiredNodes) {
            this.addErrorId(requiredNode, "Node is not processed")
        }
    }

    closeChild(child: ConstructDasCtx) {
        this._code += child._code
    }
}
