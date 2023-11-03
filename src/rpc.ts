import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {LangCoreDesc, LangDesc, LangExtraInfo} from "./lang"


export interface CompileError
{
    line : number
    message : string
    file : string
    fixme : string
    extra : string
}

export interface SaveResult
{
    saved : boolean
    compiled : boolean
    simulated : boolean
    errors : CompileError[]
    executeExitCode : number
    executeError : string
    executeResult : string
}

export const FileType = {
    Module: "M",
    Script: "S",
    None: "N"
}

export namespace FilesRpc {
    export async function list(ws: JsonRpcWebsocket, type: string): Promise<string[]> {
        return ws.call('files.list', type).then(res => <string[]>res.result)
    }

    export async function load(ws: JsonRpcWebsocket, editor: NodeEditor, path: string, type: string): Promise<boolean> {
        return ws.call('files.load', [path, type]).then(res => {
            const str = String(res.result)
            const data = JSON.parse(str)
            return editor.fromJSON(data)
        })
    }

    export async function save(ws: JsonRpcWebsocket, editor: NodeEditor, code: string, path: string, type: string, mainFunc: string): Promise<SaveResult> {
        const data = JSON.stringify(editor.toJSON())
        return ws.call('files.save', [path, type, data, code, mainFunc]).then(res => <SaveResult>res.result)
    }

    export async function getData(ws: JsonRpcWebsocket, editor: NodeEditor, path: string, type: string): Promise<string> {
        return ws.call('files.load', [path, type]).then(res => {
            return String(res.result)
        })
    }
}

export namespace LangRpc {
    export async function getLangCore(ws: JsonRpcWebsocket): Promise<LangCoreDesc> {
        return ws.call("lang.getCore").then(res => {
            return <LangCoreDesc> JSON.parse(res.result)
        })
    }

    export async function getLang(ws: JsonRpcWebsocket): Promise<LangDesc> {
        return ws.call("lang.get").then(res => {
            return <LangDesc> JSON.parse(res.result)
        })
    }

    export async function getExtraInfo(ws: JsonRpcWebsocket): Promise<LangExtraInfo> {
        return ws.call("lang.getExtra").then(res => {
            return <LangExtraInfo> JSON.parse(res.result)
        })
    }

    export async function compile(ws: JsonRpcWebsocket, file: string): Promise<boolean> {
        return ws.call("lang.execute", file).then(res => {
            console.log("compile res", res)
            return !!res.result
        })
    }
}