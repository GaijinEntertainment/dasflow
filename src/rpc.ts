import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"


export namespace FilesRpc {
    export async function list(ws: JsonRpcWebsocket): Promise<string[]> {
        let res = await ws.call('files.list')
        return <string[]>res.result
    }

    export async function load(ws: JsonRpcWebsocket, editor: NodeEditor, path: string): Promise<boolean> {
        let res = await ws.call('files.load', path)
        const str = String(res.result)
        try {
            const data = JSON.parse(str)
            return await editor.fromJSON(data)
        } catch (e) {
            console.error(`load '${path}'`, e)
            return false
        }
    }

    export async function save(ws: JsonRpcWebsocket, editor: NodeEditor, code: string, path: string): Promise<boolean> {
        const data = JSON.stringify(editor.toJSON())
        const res = await ws.call('files.save', [path, data, code])
        return !!res.result
    }
}

export namespace DasRpc {
    export async function compile(ws: JsonRpcWebsocket, file: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            ws.call("das.execute", file).then((res) => {
                console.log(res)
                resolve(!!res.result)
            })
        })
    }
}