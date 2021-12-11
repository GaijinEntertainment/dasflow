import Rete from 'rete'
import {Node} from 'rete/types/node'
import {NodeEditor} from 'rete/types/editor'

const anyType = new Rete.Socket("*")

const floatType = new Rete.Socket('float')
floatType.combineWith(anyType)
const boolType = new Rete.Socket('bool')
boolType.combineWith(anyType)

const flowSocket = new Rete.Socket('execution-flow')

function addFlowIn(node: Node) {
    let flowIn = new Rete.Input('fin', '', flowSocket)
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


const VueLabelControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
    template: '<input type="text" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
    data() {
        return {value: "",}
    },
    methods: {
        change(e) {
            this.value = e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

class LabelControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueLabelControl
        this.props = {emitter, ikey: key, readonly}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}


const VueNumControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
    template: '<input type="number" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
    data() {
        return {value: 0,}
    },
    methods: {
        change(e) {
            this.value = +e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}


class NumControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueNumControl
        this.props = {emitter, ikey: key, readonly}
    }

    setValue(val: number) {
        this.vueContext.value = val
    }
}


// ------ components

export abstract class DasComponent extends Rete.Component {
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
    }

    async builder(node) {
        addFlowInOut(node)
        let out = new Rete.Output('result', 'Value', floatType)

        node.addOutput(out)
        node.addControl(new NumControl(this.editor, 'value'))
    }

    worker(node, inputs, outputs) {
        outputs['result'] = node.data.value
    }

    writeDas(node, ctx) {
        ctx.writeLine(`let ${ctx.nodeId(node)} = ${node.data.value}`)
        traverseFlowOut(node, ctx)
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
        ctx.writeLine(`debug(${ctx.nodeId(inNode)})`)
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

        if (!traverseFlowOut(node, ctx))
            return ctx.addError(node, 'function without body')
        return true
    }

    worker(node, inputs, outputs) {
    }
}


export class WriteDasCtx {
    editor: NodeEditor
    indenting = ""
    code = ""
    errors = new Map<number, string[]>()

    constructor(editor: NodeEditor) {
        this.editor = editor
    }

    writeLine(str: string) {
        this.code += `\n${this.indenting}${str}`
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
}
