import './sockets.css'

import Rete from "rete"
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import CommentPlugin from 'rete-comment-plugin'
// import DockPlugin from 'rete-dock-plugin'
import {JsonRpcError, JsonRpcWebsocket} from "jsonrpc-client-websocket"

import {generateCoreNodes, LangComponent} from "./components"

import {DasflowContext} from "./dasflow"
import {LangRpc} from "./rpc"
import {Component} from "rete/types"


(async function () {

    const websocket = new JsonRpcWebsocket("ws://localhost:9000", 2000,
        (error: JsonRpcError) => {
            console.log(error)
        })

    const container = document.querySelector('.editor')
    const ctx = new DasflowContext(websocket)
    const editor = new Rete.NodeEditor(ctx.EDITOR_VER, <HTMLElement>container)
    ctx.editor = editor
    const engine = new Rete.Engine(ctx.EDITOR_VER)

    await websocket.open()

    // editor.use(DockPlugin, {
    //     container: <HTMLElement>document.querySelector('.dock'),
    //     // itemClass: 'item' // default: dock-item
    //     plugins: [VueRenderPlugin], // render plugins
    //     itemClass: 'dock-item', // default: dock-item
    // })

    const langCore = await LangRpc.getLangCore(websocket)
    const lang = await LangRpc.getLang(websocket)
    generateCoreNodes(langCore, lang, editor, engine)


    const defaultFileMenu = {
        reload() {
            ctx.reload()
        },
        save() {
            console.log(ctx.save())
        },
        close() {
            ctx.close()
        },
        // delete() { // TODO:
        // }
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
            for (const k of Object.keys(filesMenu)) {
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
            'show code'() {
                const dasCtx = ctx.constructDas()
                console.log(dasCtx.code)
                dasCtx.logErrors()
            },
            files: filesMenu
        },
        allocate(component: Component) {
            return (<LangComponent>component).group
        }
    })
    editor.use(CommentPlugin, {
        margin: 20 // default indent for new frames is 30px
    })


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

    refreshFilesList()
    await ctx.firstStart()
})()
