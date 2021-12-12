require strings

require dasweb/web_server_debug
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
    // server.debugLogs = true
    jsonRpc = new JsonRpcHandler()

    jsonRpc->addCall("das.execute", new MFunctionRpcCall(@@das_execute))
    jsonRpc->addCall("editor.load", new MFunctionRpcCall(@@editor_load))
    jsonRpc->addCall("editor.save", new MFunctionRpcCall(@@editor_save))

    jsonRpc->listen(server)
    jsonRpc->listenUnhandled(server)
    return run_debug_server(server)


def send_serponse(var data: JsonValue?; id: uint64)
    jsonRpc->sendResponse(server, data, id)


[rpc_call]
def editor_load(path: string; id: uint64)
    print("< req load data `{path}`\n")

    var ok = false
    fopen(path, "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                ok = true
                send_serponse(JV("{data}"), id)
    if !ok
        send_serponse(JV(null), id)


[rpc_call]
def editor_save(path: string; data: string; id: uint64)
    print("< req run save data `{path}`\n{data}\n")
    var ok = false
    fopen(path, "wb") <| $(f)
        if f != null
            ok = true
            f |> fwrite(data)

    send_serponse(JV(ok), id)


[rpc_call]
def das_execute(code: string; id: uint64)
    print("< req run code\n{code}\n")
    send_serponse(JV("run! " + code), id)
