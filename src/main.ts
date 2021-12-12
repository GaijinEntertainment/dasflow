import Rete from "rete"
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import {JsonRpcError, JsonRpcWebsocket} from "jsonrpc-client-websocket"

import {Debug, FloatLet, Function} from "./dasComponents"

import './sockets.css'
import {DasRpc, EditorRpc} from "./rpc"


(async function () {

    const DEFAULT_FLOW = 'default.dasflow'
    const EDITOR_VER = 'dasflow@0.0.1'

    const websocket = new JsonRpcWebsocket("ws://localhost:9000", 2000,
        (error: JsonRpcError) => {
            console.log(error)
        })

    const container: HTMLElement | null = document.querySelector('#rete')
    const editor = new Rete.NodeEditor(EDITOR_VER, <HTMLElement>container)

    const floatComp = new FloatLet()
    const debugComp = new Debug()
    const functionComp = new Function()
    const comps = [floatComp, debugComp, functionComp]

    editor.use(ConnectionPlugin)
    editor.use(VueRenderPlugin)
    editor.use(ContextMenuPlugin, {
        items: {
            'log dascript'() {
                DasRpc.compile(websocket, editor)
            },
            files: {
                load() {
                    EditorRpc.load(websocket, editor, DEFAULT_FLOW)
                },
                save() {
                    EditorRpc.save(websocket, editor, DEFAULT_FLOW)
                },
            },
        },
        // allocate(component) {
        //     return component.name
        // },
    })

    const engine = new Rete.Engine(EDITOR_VER)

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

    await websocket.open()
    await EditorRpc.load(websocket, editor, DEFAULT_FLOW)
})()
