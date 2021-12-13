import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"


export namespace FilesRpc {
    export async function list(ws: JsonRpcWebsocket): Promise<string[]> {
        return ws.call('files.list').then(res => <string[]>res.result)
    }

    export async function load(ws: JsonRpcWebsocket, editor: NodeEditor, path: string): Promise<boolean> {
        return ws.call('files.load', path).then(res => {
            const str = String(res.result)
            const data = JSON.parse(str)
            return editor.fromJSON(data)
        })
    }

    export async function save(ws: JsonRpcWebsocket, editor: NodeEditor, code: string, path: string): Promise<boolean> {
        const data = JSON.stringify(editor.toJSON())
        return ws.call('files.save', [path, data, code]).then(res => !!res.result)
    }
}

export namespace DasRpc {
    export async function compile(ws: JsonRpcWebsocket, file: string): Promise<boolean> {
        return ws.call("das.execute", file).then(res => {
            console.log(res)
            return !!res.result
        })
    }
}