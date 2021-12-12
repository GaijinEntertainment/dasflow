import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {TopLevelDasComponent, WriteDasCtx} from "./dasComponents"


export namespace EditorRpc {
    export async function load(ws: JsonRpcWebsocket, editor: NodeEditor, path: string): Promise<boolean> {
        let res = await ws.call('editor.load', path)
        const str = String(res.result)
        try {
            const data = JSON.parse(str)
            return await editor.fromJSON(data)
        } catch (e) {
            console.error(`load '${path}'`, e)
            return false
        }
    }

    export async function save(ws: JsonRpcWebsocket, editor: NodeEditor, path: string): Promise<boolean> {
        const data = JSON.stringify(editor.toJSON())
        const res = await ws.call('editor.save', [path, data])
        return !!res.result
    }
}

export namespace DasRpc {
    export async function compile(ws: JsonRpcWebsocket, editor: NodeEditor): Promise<boolean> {
        let ctx = new WriteDasCtx(editor)
        for (const node of editor.nodes) {
            let component = editor.components.get(node.name)
            if (component instanceof TopLevelDasComponent)
                component.writeDas(node, ctx)
        }
        console.log(ctx.code)
        if (ctx.hasErrors()) {
            ctx.logErrors()
            return false
        }
        return new Promise<boolean>(resolve => {
            ws.call("das.execute", ctx.code).then((res) => {
                console.log(res)
                resolve(!!res.result)
            })
        })
    }
}