require strings

require dasweb/web_debug_server
require dasweb/jsonrpc_handler
require dasweb/jsonrpc_args
require dasweb/jsonrpc_boost

require fio

var jsonRpc: JsonRpcHandler?
var server: WebServer?

var compilerPath: string

[export]
def main ()
    let args <- get_command_line_arguments()
    compilerPath = args[0]

    server = new WebServer()
    jsonRpc = new JsonRpcHandler()

    jsonRpc->addCall("das.execute", new MFunctionRpcCall(@@das_execute))
    jsonRpc->addCall("editor.load", new MFunctionRpcCall(@@editor_load))
    jsonRpc->addCall("editor.save", new MFunctionRpcCall(@@editor_save))

    jsonRpc->listen(server)
    jsonRpc->listenUnhandled(server)
    return run_debug_server(server)


[rpc_call]
def editor_load(path: string; id: uint64)
    print("< req load data `{path}`\n")

    var res = false
    fopen(path, "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                res = true
                jsonRpc->sendResponse(server, JV("{data}"), id)
    if !res
        jsonRpc->sendResponse(server, JV(null), id)


[rpc_call]
def editor_save(path: string; data: string; id: uint64)
    print("< req run save data `{path}`\n{data}\n")
    var res = false
    fopen(path, "wb") <| $(f)
        if f != null
            res = true
            f |> fwrite(data)

    jsonRpc->sendResponse(server, JV(res), id)


[rpc_call]
def das_execute(code: string; id: uint64)
    print("< req run code\n{code}\n")
    jsonRpc->sendResponse(server, JV("run! " + code), id)
