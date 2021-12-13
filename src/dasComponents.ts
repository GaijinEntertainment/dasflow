import Rete, {Socket} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {ComboBoxControl, LabelControl, NumControl} from "./controls"

const anyType = new Rete.Socket("*")

const floatType = new Rete.Socket('float')
floatType.combineWith(anyType)
const stringType = new Rete.Socket('string')
stringType.combineWith(anyType)
const boolType = new Rete.Socket('bool')
boolType.combineWith(anyType)

const baseTypes: { [key: string]: Socket } = {
    float: floatType,
    string: stringType,
    bool: boolType
}

const flowSocket = new Rete.Socket('execution-flow')


export abstract class DasComponent extends Rete.Component {
    private lazyInit = true
    private flowOut = false

    protected constructor(name: string) {
        super(name)
    }

    worker(node, inputs, outputs) {
    }

    private addFlowIn(node: Node) {
        this.lazyInit = false
        const flowIn = new Rete.Input('fin', '', flowSocket, false)
        node.addInput(flowIn)
    }

    addFlowOut(node: Node) {
        this.flowOut = true
        const flowOut = new Rete.Output('fout', '', flowSocket, false)
        node.addOutput(flowOut)
    }

    addFlowInOut(node: Node) {
        this.addFlowIn(node)
        this.addFlowOut(node)
    }

    // writer

    writeDas(node: Node, ctx: WriteDasCtx): boolean {
        const res = this.writeDasNode(node, ctx)
        if (res && this.flowOut)
            this.writeDasFlowOut(node, ctx)
        return res
    }


    abstract writeDasNode(node: Node, ctx: WriteDasCtx): boolean


    getInNode(node: Node, name: string, ctx: WriteDasCtx): Node | null {
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
        DasComponent.writeAutoInit(inNode, ctx)
        return inNode
    }


    private static writeAutoInit(node: Node, ctx: WriteDasCtx) {
        if (ctx.isLazyInited(node))
            return
        const component = <DasComponent>ctx.editor.components.get(node.name)
        if (!component.lazyInit)
            return
        ctx.setIsLazyInit(node)
        component.writeDas(node, ctx)
    }


    writeDasFlowOut(node: Node, ctx: WriteDasCtx): boolean {
        const out = node.outputs.get('fout')
        if (!out || out.connections.length == 0)
            return false
        const nextNode = out.connections[0].input.node
        if (!nextNode)
            return false
        const component: DasComponent = <DasComponent>ctx.editor.components.get(nextNode.name)
        return component.writeDas(nextNode, ctx)
    }
}


export abstract class TopLevelDasComponent extends DasComponent {
    protected constructor(name: string) {
        super(name)
    }
}


export class FloatLet extends DasComponent {
    constructor() {
        super('FloatLet')
    }

    async builder(node) {
        const out = new Rete.Output('result', 'Value', floatType, true)
        node.addOutput(out)
        node.addControl(new NumControl(this.editor, 'value'))
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
    }

    writeDasNode(node, ctx) {
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${node.data.value}`)
        return true
    }
}

export class Let extends DasComponent {
    constructor() {
        super('Let')
    }

    async builder(node) {
        const out = new Rete.Output('result', 'Value', floatType, true)
        node.addOutput(out)
        node.addControl(new ComboBoxControl(this.editor, 'type', baseTypes))
        node.addControl(new LabelControl(this.editor, 'value'))
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
        outputs['type'] = node.data.type
        // TODO: validate value
        if (!this.editor)
            return
        const output = this.editor.nodes.find(it => it.id == node.id)?.outputs.get('result')
        if (!output)
            return
        const outputSocket: Socket = baseTypes[node.data.type]
        if (output.socket != outputSocket) {
            for (const conn of output.connections.concat([])) {
                if (!outputSocket.compatibleWith(conn.input.socket)) {
                    this.editor.removeConnection(conn)
                }
            }
            output.socket = outputSocket
        }
    }

    writeDasNode(node, ctx) {
        const val = node.data.type == "string" ? `"${node.data.value}"` : node.data.value
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${val}`)
        return true
    }
}


export class Debug extends DasComponent {
    constructor() {
        super('Debug')
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
        const label: LabelControl = <LabelControl>refNode?.controls.get('label')
        label.setValue(val)
    }

    writeDasNode(node, ctx) {
        const inNode = this.getInNode(node, 'inValue', ctx)
        if (!inNode)
            return false
        ctx.writeLine(`debug(${ctx.nodeId(inNode)})`)
        return true
    }
}


export class Sin extends DasComponent {
    constructor() {
        super('Sin')
    }

    async builder(node) {
        const input = new Rete.Input('inValue', 'Value', floatType)
        node.addInput(input)
        const result = new Rete.Output('result', 'Value', floatType, true)
        node.addOutput(result)
    }

    writeDasNode(node, ctx) {
        const inNode = this.getInNode(node, 'inValue', ctx)
        if (!inNode)
            return false
        ctx.addReqModule('math')
        ctx.writeLine(`let ${ctx.nodeId(node)} = sin(${ctx.nodeId(inNode)})`)
        return true
    }
}


export class Function extends TopLevelDasComponent {
    constructor() {
        super('Function')
    }

    async builder(node) {
        this.addFlowOut(node)
        node.addControl(new LabelControl(this.editor, 'name'))
    }

    writeDas(node, ctx) {
        // TODO: create new ctx to patch fn arguments
        ctx.writeLine(`def ${node.data.name}()`)
        ctx.indenting += "\t"

        const res = this.writeDasFlowOut(node, ctx)
        if (!res)
            ctx.writeLine("pass")
        ctx.indenting = ""
        ctx.writeLine("")
        return true
    }

    writeDasNode(node: Node, ctx: WriteDasCtx): boolean {
        return true
    }
}


export class WriteDasCtx {
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
