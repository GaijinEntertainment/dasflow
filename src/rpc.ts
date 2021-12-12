import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"


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