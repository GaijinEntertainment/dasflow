require strings

require dasweb/web_debug_server
require dasweb/jsonrpc_handler
require dasweb/jsonrpc_args

require fio

[export]
def main ()
    let args <- get_command_line_arguments()
    let compilerPath = args[0]

    var server = new WebServer()

    var jsonRpc = new JsonRpcHandler()


    var runDasHandler <- @ <| (var params: JsonValue?; id: uint64)
        let str = params |> get_arg(0) |> as_string()
        print("req run code\n{str}\n")
        jsonRpc->sendResponse(server, JV("run! " + str), id)

    jsonRpc->addCall("das.execute", new LambdaRpcCall(runDasHandler))


    var editorSaveHandler <- @ <| (var params: JsonValue?; id: uint64)
        let path = params |> get_arg(0) |> as_string()
        let data = params |> get_arg(1) |> as_string()

        print("req run save data `{path}`\n{data}\n")
        var res = false
        fopen(path, "wb") <| $(f)
            if f != null
                res = true
                f |> fwrite(data)

        jsonRpc->sendResponse(server, JV(res), id)

    jsonRpc->addCall("editor.save", new LambdaRpcCall(editorSaveHandler))


    var editorLoadHandler <- @ <| (var params: JsonValue?; id: uint64)
        let path = params |> get_arg(0) |> as_string()

        print("req run load data `{path}`\n")

        var res = false
        fopen(path, "rb") <| $(f)
            if f != null
                f |> fread <| $(data)
                    res = true
                    jsonRpc->sendResponse(server, JV("{data}"), id)
        if !res
            jsonRpc->sendResponse(server, JV(null), id)

    jsonRpc->addCall("editor.load", new LambdaRpcCall(editorLoadHandler))

    jsonRpc->listen(server)
    jsonRpc->listenUnhandled(server)
    return run_debug_server(server)
