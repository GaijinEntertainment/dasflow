import Rete, {Engine, Input, Output} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {LabelControl, LangTypeSelectControl, TextInputControl} from "./controls"
import {LangCoreDesc, LangType} from "./lang"
import {Component} from "rete/types"

const anyType = new Rete.Socket("*")

// TODO: remove this type
const floatType = new Rete.Socket('float')
floatType.combineWith(anyType)

const flowSocket = new Rete.Socket('execution-flow')

// TODO: immutable, mutable and any types
const coreTypes = new Map<string, LangType>()
const coreTypeGroups = new Map<string, LangType[]>()


export function getType(name: string): LangType | undefined {
    if (coreTypes.has(name))
        return coreTypes.get(name)
    return undefined
}

export function getTypeByName(types: LangType[], name: string) {
    for (let baseType of types) {
        if (baseType.desc.name == name) {
            return baseType
        }
    }
    return types[0]
}


export function generateCoreNodes(langCore: LangCoreDesc, editor: NodeEditor, engine: Engine) {
    console.log(langCore)
    const logicTypeName = langCore.logicType
    const comps: Component[] = []
    for (const typeDesc of langCore.types) {
        let group = typeDesc.group ?? typeDesc.name
        if (typeDesc.struct && typeDesc.group) {
            console.error(`type ${typeDesc.name} with struct and group. Group will be ignored`)
            group = ''
        }

        let type = new LangType()
        type.desc = typeDesc
        type.defaultValue = typeDesc.default ?? ""
        type.socket = new Rete.Socket(typeDesc.name)
        type.socket.combineWith(anyType)

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

        coreTypes.set(typeDesc.name, type)
        if (coreTypeGroups.has(group))
            coreTypeGroups.get(group)?.push(type)
        else
            coreTypeGroups.set(group, [type])

        if (typeDesc.name == logicTypeName)
            comps.push(new If(type), new While(type))
    }

    for (let [groupName, coreTypeGroup] of coreTypeGroups) {
        const langLet = new LangLet(groupName, ['core types'], coreTypeGroup)
        comps.push(langLet)
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


    constructInNode(node: Node, name: string, ctx: ConstructDasCtx): Node | null {
        const inValue = node.inputs.get(name)
        if (!inValue || inValue.connections.length == 0) {
            ctx.addError(node, 'input expected')
            return null
        }
        const inNode = inValue.connections[0].output.node
        if (!inNode) {
            ctx.addError(node, 'input expected')
            return null
        }
        LangComponent.constructAutoInit(inNode, ctx)
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
        let type = 'type' in node.data ? getTypeByName(this.baseTypes, node.data.type) : this.baseTypes[0]
        const out = new Rete.Output('result', 'Value', type.socket, true)
        node.addOutput(out)
        let struct = this.baseTypes[0].desc.struct
        if (struct) {
            for (const field of struct)
                node.addControl(new TextInputControl(this.editor, field.name))
        } else {
            if (this.baseTypes.length > 1)
                node.addControl(new LangTypeSelectControl(this.editor, 'type', this.baseTypes))
            node.addControl(new TextInputControl(this.editor, 'value'))
        }

        node.data.type = type.desc.name
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
        outputs['type'] = node.data.type
        const nodeRef = this.editor?.nodes.find(it => it.id == node.id)
        if (!nodeRef)
            return
        let currentType = getTypeByName(this.baseTypes, node.data.type)
        const controls = new Map<TextInputControl, LangType>()
        const struct = currentType.desc.struct
        if (struct) {
            for (const field of struct) {
                const fieldCtrl = nodeRef.controls.get(field.name)
                if (fieldCtrl)
                    controls.set(<TextInputControl>fieldCtrl, <LangType>getType(field.type))
            }
        } else {
            let valueCtrl = nodeRef.controls.get('value')
            if (valueCtrl)
                controls.set(<TextInputControl>valueCtrl, currentType)
        }

        // const valueCtrl = <TextInputControl>nodeRef.controls.get('value')
        for (const [valueCtrl, valueType] of controls) {
            if (valueCtrl.validator != valueType.validator || valueCtrl.defaultValue != valueType.defaultValue || valueCtrl.values != valueType.desc.enum) {
                valueCtrl.validator = valueType.validator
                valueCtrl.defaultValue = valueType.defaultValue
                valueCtrl.values = valueType.desc.enum
                valueCtrl.setValue(node.data[valueCtrl.key]) // revalidate data
            }
        }

        const output = nodeRef.outputs.get('result')
        if (output) {
            const outputSocket = currentType.socket
            if (output.socket != outputSocket) {
                for (const conn of [...output.connections]) {
                    if (!outputSocket.compatibleWith(conn.input.socket)) {
                        this.editor?.removeConnection(conn)
                    }
                }
                output.socket = outputSocket
            }
        }

        const ctorArgs: { [key: string]: string } = {}
        if (struct)
            for (const field of struct)
                ctorArgs[field.name] = node.data[field.name]
        outputs['result'] = currentType.ctor(node.data.value, ctorArgs)
    }

    constructDasNode(node, ctx) {
        const currentType = getTypeByName(this.baseTypes, node.data.type)
        const ctorArgs: { [key: string]: string } = {}
        const struct = currentType.desc.struct
        if (struct)
            for (const field of struct)
                ctorArgs[field.name] = getType(field.type)?.ctor(node.data[field.name], {}) ?? ""

        const val = currentType.ctor(node.data.value, ctorArgs)
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${val}`)
        return true
    }
}


export class Debug
    extends LangComponent {
    constructor() {
        super('Debug', ['functions'])
    }

    async builder(node) {
        this.addFlowInOut(node)
        const input = new Rete.Input('inValue', 'Value', anyType)
        node.addInput(input)
        node.addControl(new LabelControl(this.editor, 'label', true))
    }

    worker(node, inputs, outputs) {
        const val = inputs['inValue']?.length ? inputs['inValue'] : node.data.value
        const refNode = this.editor?.nodes.find(n => n.id === node.id)
        const label = <LabelControl>refNode?.controls.get('label')
        label.setValue(val)
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'inValue', ctx)
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
        const input = new Rete.Input('inValue', 'Condition', this.conditionType.socket)
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
        const input = new Rete.Input('inValue', 'Condition', this.conditionType.socket)
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
    constructor() {
        super('Sin', ['functions'])
    }

    async builder(node) {
        const input = new Rete.Input('inValue', 'Value', floatType)
        node.addInput(input)
        const result = new Rete.Output('result', 'Value', floatType, true)
        node.addOutput(result)
    }

    constructDasNode(node, ctx) {
        const inNode = this.constructInNode(node, 'inValue', ctx)
        if (!inNode)
            return false
        ctx.addReqModule('math')
        ctx.writeLine(`let ${ctx.nodeId(node)} = sin(${ctx.nodeId(inNode)})`)
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
        }
        return this._code
    }

    editor: NodeEditor
    indenting = ""
    private _code = ""
    errors = new Map<number, string[]>()
    private lazyInited = new Set<number>()
    private requirements = new Set<string>()

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

    nodeId(node: Node) {
        return `_${node.id}`
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
}
