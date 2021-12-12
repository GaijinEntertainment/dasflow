import './sockets.css'

import Rete from "rete"
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import {JsonRpcError, JsonRpcWebsocket} from "jsonrpc-client-websocket"

import {Debug, FloatLet, Function} from "./dasComponents"

import {DasRpc} from "./rpc"
import {DasflowContext} from "./dasflow"


(async function () {


    const websocket = new JsonRpcWebsocket("ws://localhost:9000", 2000,
        (error: JsonRpcError) => {
            console.log(error)
        })

    const container: HTMLElement | null = document.querySelector('#rete')
    const ctx = new DasflowContext(websocket)
    const editor = new Rete.NodeEditor(ctx.EDITOR_VER, <HTMLElement>container)
    ctx.editor = editor

    const floatComp = new FloatLet()
    const debugComp = new Debug()
    const functionComp = new Function()
    const comps = [floatComp, debugComp, functionComp]

    const defaultFileMenu = {
        reload() {
            ctx.reload()

        },
        save() {
            ctx.save()
        },
        close() {
            ctx.close()
        },
    }
    const currentFileMenu = {}

    const filesMenu = {
        'current file': currentFileMenu,
        // create() {
        //     throw "not implemented" // TODO:
        // }
    }
    const filePrefix = './'
    const refreshFilesList = () => {
        ctx.refreshFilesList().then((files) => {
            for (const k in Object.keys(filesMenu)) {
                if (k.startsWith(filePrefix))
                    delete filesMenu[k]
            }
            if (!files)
                return
            for (const fn of files)
                filesMenu[`${filePrefix}${fn}`] = {
                    load() {
                        ctx.loadFile(fn)
                    },
                }
        })
    }
    filesMenu['refresh list'] = refreshFilesList

    ctx.onCurrentNameChange.subscribe((val) => {
        for (let key of Object.keys(currentFileMenu)) {
            delete currentFileMenu[key]
        }
        if (val != "") {
            currentFileMenu[val] = function () {
            }
            for (const [k, v] of Object.entries(defaultFileMenu))
                currentFileMenu[k] = v
        } else {
            currentFileMenu["<no file>"] = function () {
            }
        }
    })

    editor.use(ConnectionPlugin)
    editor.use(VueRenderPlugin)
    editor.use(ContextMenuPlugin, {
        items: {
            'log dascript'() {
                DasRpc.compile(websocket, editor)
            },
            files: filesMenu
        },
    })

    const engine = new Rete.Engine(ctx.EDITOR_VER)

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


    websocket['onError'] = (err) => {
        if (err?.data.type === "close") {
            const delay = 200
            console.log(`socket was closed, reopen in ${delay}ms`, err)
            setTimeout(async () => {
                let res = await websocket.open()
                console.log('websocket reopened?', res)
            }, delay)
        }
    }

    await websocket.open()
    refreshFilesList()
    await ctx.firstStart()
})()
