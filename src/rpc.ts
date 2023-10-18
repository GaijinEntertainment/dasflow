import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {LangCoreDesc, LangDesc} from "./lang"


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

    function find_main_func_name(data): string {
        for (let id in data.nodes)
            for (let elem in data.nodes[id])
                if (elem == "data")
                    for (let data_elem in data.nodes[id][elem])
                        if (data_elem == "annotation" && data.nodes[id][elem][data_elem].includes("export"))
                            for (let again in data.nodes[id][elem])
                                if (again == "name")
                                    return data.nodes[id][elem][again]
        return ""
    }

    export async function save(ws: JsonRpcWebsocket, editor: NodeEditor, code: string, path: string): Promise<SaveResult> {
        let main_func = find_main_func_name(editor.toJSON())

        const data = JSON.stringify(editor.toJSON())
        return ws.call('files.save', [path, data, code, main_func]).then(res => <SaveResult>res.result)
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

    export async function compile(ws: JsonRpcWebsocket, file: string): Promise<boolean> {
        return ws.call("lang.execute", file).then(res => {
            console.log("compile res", res)
            return !!res.result
        })
    }
}