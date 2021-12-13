import Rete, {Socket} from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'
import {ComboBoxControl, LabelControl, NumControl} from "./controls"

const anyType = new Rete.Socket("*")

const floatType = new Rete.Socket('float')
floatType.combineWith(anyType)
const stringType = new Rete.Socket('string')
floatType.combineWith(anyType)
const boolType = new Rete.Socket('bool')
boolType.combineWith(anyType)

const baseTypes: { [key: string]: Socket } = {
    float: floatType,
    string: stringType,
    bool: boolType
}

const flowSocket = new Rete.Socket('execution-flow')

function addFlowIn(node: Node) {
    let flowIn = new Rete.Input('fin', '', flowSocket, false)
    node.addInput(flowIn)
}

function addFlowOut(node: Node) {
    let flowOut = new Rete.Output('fout', '', flowSocket, false)
    node.addOutput(flowOut)
}

function addFlowInOut(node: Node) {
    addFlowIn(node)
    addFlowOut(node)
}


function traverseFlowOut(node: Node, ctx: WriteDasCtx) {
    const out = node.outputs.get('fout')
    if (!out || out.connections.length == 0)
        return false
    const nextNode = out.connections[0].input.node
    if (!nextNode)
        return false
    const component: DasComponent = <DasComponent>ctx.editor.components.get(nextNode.name)
    return component.writeDas(nextNode, ctx)
}


function autoInit(node: Node, ctx: WriteDasCtx) {
    if (ctx.isLazyInited(node))
        return
    let component = <DasComponent>ctx.editor.components.get(node.name)
    if (!component.lazyInit)
        return

    ctx.setIsLazyInit(node)
    component.writeDas(node, ctx)
}


export abstract class DasComponent extends Rete.Component {
    lazyInit = false

    protected constructor(name: string) {
        super(name)
    }

    writeDas(node: Node, ctx: WriteDasCtx) {
        return true
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
        this.lazyInit = true
    }

    async builder(node) {
        let out = new Rete.Output('result', 'Value', floatType, true)

        node.addOutput(out)
        node.addControl(new NumControl(this.editor, 'value'))
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
    }

    writeDas(node, ctx) {
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${node.data.value}`)
        return true
    }
}

export class Let extends DasComponent {
    constructor() {
        super('Let')
        this.lazyInit = true
    }

    async builder(node) {
        let out = new Rete.Output('result', 'Value', floatType, true)

        node.addOutput(out)
        node.addControl(new ComboBoxControl(this.editor, 'type', baseTypes))
        node.addControl(new LabelControl(this.editor, 'value'))
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
        outputs['type'] = node.data.type
        if (!this.editor)
            return
        const output = this.editor.nodes.find(it => it.name == node.name)?.outputs.get('result')
        if (!output)
            return
        const newSocket: Socket = baseTypes[node.data.type]
        if (output.socket != newSocket) {
            for (const conn of output.connections.concat([])) {
                if (!conn.output.socket.compatibleWith(newSocket)) {
                    this.editor.removeConnection(conn)
                }
            }
            output.socket = newSocket
        }
    }

    writeDas(node, ctx) {
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
        addFlowInOut(node)
        let input = new Rete.Input('inValue', 'Value', anyType)
        node.addInput(input)
        node.addControl(new LabelControl(this.editor, 'label', true))
    }

    worker(node, inputs, outputs) {
        const val = inputs['inValue']?.length ? inputs['inValue'] : node.data.value
        const refNode = this.editor?.nodes.find(n => n.id === node.id)
        const label: LabelControl = <LabelControl>refNode?.controls.get('label')
        label.setValue(val)
    }

    writeDas(node, ctx) {
        const inValue = node.inputs.get('inValue')
        if (!inValue || inValue.connections.length == 0)
            return ctx.addError(node, 'input expected')
        let inNode = inValue.connections[0].output.node
        if (!inNode)
            return ctx.addError(node, 'input expected')
        autoInit(inNode, ctx)
        ctx.writeLine(`debug(${ctx.nodeId(inNode)})`)
        traverseFlowOut(node, ctx)
        return true
    }
}


export class Sin extends DasComponent {
    constructor() {
        super('Sin')
        this.lazyInit = true
    }

    async builder(node) {
        let input = new Rete.Input('inValue', 'Value', floatType)
        node.addInput(input)
        let result = new Rete.Output('result', 'Value', floatType, true)
        node.addOutput(result)
    }

    worker(node, inputs, outputs) {
    }

    writeDas(node, ctx) {
        const inValue = node.inputs.get('inValue')
        if (!inValue || inValue.connections.length == 0)
            return ctx.addError(node, 'input expected')
        let inNode = inValue.connections[0].output.node
        if (!inNode)
            return ctx.addError(node, 'input expected')
        autoInit(inNode, ctx)
        ctx.addReqModule("math")
        ctx.writeLine(`let ${ctx.nodeId(node)} = sin(${ctx.nodeId(inNode)})`)
        traverseFlowOut(node, ctx)
        return true
    }
}


export class Function extends TopLevelDasComponent {
    constructor() {
        super('Function')
    }

    async builder(node) {
        addFlowOut(node)
        node.addControl(new LabelControl(this.editor, 'name'))
    }

    writeDas(node, ctx) {
        ctx.writeLine(`def ${node.data.name}()`)
        ctx.indenting += "\t"

        const res = traverseFlowOut(node, ctx)
        if (!res)
            ctx.writeLine("pass")
        ctx.indenting = ""
        ctx.writeLine("")
        return true
    }

    worker(node, inputs, outputs) {
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
            let data = this.errors.get(node.id)
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
