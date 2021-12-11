import Rete from "rete"
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import {Debug, FloatLet, Function, TopLevelDasComponent, WriteDasCtx} from "./dasComponents"

import './sockets.css'

(async function () {

    const container: HTMLElement | null = document.querySelector('#rete')
    const editor = new Rete.NodeEditor('demo@0.1.0', <HTMLElement>container)

    const floatComp = new FloatLet()
    const debugComp = new Debug()
    const functionComp = new Function()
    const comps = [floatComp, debugComp, functionComp]

    editor.use(ConnectionPlugin)
    editor.use(VueRenderPlugin)
    editor.use(ContextMenuPlugin, {
        items: {
            'log dascript'() {
                let ctx = new WriteDasCtx(editor)
                for (const node of editor.nodes) {
                    let component = editor.components.get(node.name)
                    if (component instanceof TopLevelDasComponent)
                        component.writeDas(node, ctx)
                }
                console.log(ctx.code)
                ctx.logErrors()
            }
        },
    })

    const engine = new Rete.Engine('demo@0.1.0')

    comps.forEach(it => {
            editor.register(it)
            engine.register(it)
        }
    )

    const n1 = await floatComp.createNode({value: 2})
    n1.position = [200, 200]
    editor.addNode(n1)
    const n2 = await floatComp.createNode({value: 3})
    n2.position = [0, 200]
    editor.addNode(n2)
    const fn = await functionComp.createNode({name: "foobar"})
    editor.addNode(fn)

    const debug = await debugComp.createNode()
    debug.position = [250, 0]

    editor.addNode(debug)

    editor.on(['process', 'nodecreated', 'noderemoved', 'connectioncreated', 'connectionremoved'], async () => {
        await engine.abort()
        await engine.process(editor.toJSON())
    })

    editor.view.resize()

    editor.trigger('process')
})()
