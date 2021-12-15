import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {LangCoreDesc} from "./lang"


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

export namespace LangRpc {
    export async function getLangCore(ws: JsonRpcWebsocket): Promise<LangCoreDesc> {
        return ws.call("lang.getCore").then(res => {
            return <LangCoreDesc> JSON.parse(res.result)
        })
    }

    export async function compile(ws: JsonRpcWebsocket, file: string): Promise<boolean> {
        return ws.call("lang.execute", file).then(res => {
            console.log("compile res", res)
            return !!res.result
        })
    }
}