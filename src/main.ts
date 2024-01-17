import './sockets.css'

import Rete from "rete"
import ConnectionPlugin from 'rete-connection-plugin'
import VueRenderPlugin from 'rete-vue-render-plugin'
import ContextMenuPlugin from 'rete-context-menu-plugin'
import CommentPlugin from 'rete-comment-plugin'
import ModulePlugin from 'rete-module-plugin'
import {JsonRpcError, JsonRpcWebsocket} from "jsonrpc-client-websocket"

import {generateCoreNodes, LangComponent} from "./components"

import {DasflowContext} from "./dasflow"
import {LangRpc, FileType} from "./rpc"
import {Component} from "rete/types"


function enterUniqueFileName(files, fileSuffix = '.dasflow'): string | null {
    let enteredName = prompt("Please enter new file name", "")
    if (enteredName == null)
        return null

    enteredName += fileSuffix
    if (files.includes(enteredName)) {
        alert("File with this name already exists")
        return null
    }

    return enteredName
}


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

    const modules = {}
    const filePrefix = './'

    for (const type in FileType)
        ctx.refreshFilesList(FileType[type]).then((files) => {
            for (const fn of files) {
                ctx.getFileData(fn, FileType[type]).then((temp) => {
                    modules[`${filePrefix}${fn}`] = { data: JSON.parse(temp) }
                })
            }
        })
    editor.use(ModulePlugin, {engine, modules})

    const langCore = await LangRpc.getLangCore(websocket)
    const lang = await LangRpc.getLang(websocket)
    const extra = await LangRpc.getExtraInfo(websocket)
    generateCoreNodes(langCore, lang, extra, editor, engine)


    const defaultFileMenu = {
        reload() {
            ctx.reload()
        },
        save() {
            console.log(ctx.save())
            modules[`${filePrefix}${ctx.ctxFile}`] = { data: editor.toJSON() }
        },
        close() {
            ctx.close()
        },
    }

    const filesMenu = {}
    const modulesMenu = {}

    const refreshFilesList = (menu, type) => {
        ctx.refreshFilesList(type).then((files) => {
            for (const k of Object.keys(menu)) {
                if (k.startsWith(filePrefix)) {
                    delete menu[k]
                    delete modules[k]
                }
            }
            if (!files)
                return
            for (const fn of files) {
                ctx.getFileData(fn, type).then((data) => {
                    modules[`${filePrefix}${fn}`] = { data: JSON.parse(data) }
                })

                menu['create new'] = () => {
                    let enteredName = enterUniqueFileName(files)
                    if (enteredName == null)
                        return
                    ctx.create(enteredName, type)
                    refreshFilesList(menu, type)
                }

                menu[`${filePrefix}${fn}`] = {
                    load() {
                        ctx.loadFile(fn, type)
                    },
                    rename() {
                        let newName = enterUniqueFileName(files)
                        if (newName == null)
                            return
                        ctx.rename(newName, fn, type)
                        refreshFilesList(menu, type)
                    },
                    delete() {
                        ctx.delete(fn, type)
                        refreshFilesList(menu, type)
                    },
                }
            }
        })
    }
    const refreshFiles = function() { refreshFilesList(filesMenu, FileType.Script) }
    const refreshModules = function() { refreshFilesList(modulesMenu, FileType.Module) }

    filesMenu['refresh list'] = refreshFiles
    modulesMenu['refresh list'] = refreshModules

    const currentFileMenu = {}

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
                ctx.constructDas().then((dasCtx) => {
                    console.log(dasCtx.code)
                    dasCtx.logErrors()
                })
            },
            'current file': currentFileMenu,
            files: filesMenu,
            modules: modulesMenu
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

    // @ts-ignore
    editor.on('commentcreated', function (comment) {
        ctx.storeComment(comment)
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

    refreshFiles()
    refreshModules()
    await ctx.firstStart()
})()
