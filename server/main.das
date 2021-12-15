require strings

require dasweb/web_server
require dasweb/web_server_debug
require dasweb/jsonrpc_boost

require fio

var jsonRpc: JsonRpcHandler?
var server: WebServer?

var flowsDir = "flows/"
var compilerPath: string

[export]
def main()
    initialize()
    while true
        server->tick()
        sleep(10u)

    server->stop()

[export]
def initialize()
    print("[re]start main.das\n")

    let args <- get_command_line_arguments()
    compilerPath = args[0]

    server = new WebServer()
    // server.debugLogs = true
    jsonRpc = new JsonRpcHandler()

    jsonRpc->addCall("lang.getCore", new MFunctionRpcCall(@@lang_getCore))
    jsonRpc->addCall("lang.execute", new MFunctionRpcCall(@@lang_execute))
    jsonRpc->addCall("files.load", new MFunctionRpcCall(@@files_load))
    jsonRpc->addCall("files.save", new MFunctionRpcCall(@@files_save))
    jsonRpc->addCall("files.list", new MFunctionRpcCall(@@files_list))

    jsonRpc->listen(server)
    jsonRpc->listenUnhandled(server)
    start_server(server)


[export]
def act()
    server->tick()


[export]
def shutdown()
    print("shutdown main.das\n")
    server->stop()


def send_response(var data: JsonValue?; id: uint64)
    jsonRpc->sendResponse(server, data, id)


[rpc_call]
def files_load(filePath: string; id: uint64)
    let path = flowsDir + filePath
    print("< req load data `{path}`\n")

    var ok = false
    fopen(path, "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                ok = true
                var lfPos = data |> find('\n')
                if lfPos < 0
                    lfPos = length(data)
                let firstLine = data |> slice(3, lfPos)
                send_response(JV(firstLine), id)
    if !ok
        send_response(JV(null), id)


[rpc_call]
def files_save(filePath: string; data: string; code: string; id: uint64)
    let path = flowsDir + filePath
    print("< req run save data `{path}`\n{data}\n")
    var ok = false
    fopen(path, "wb") <| $(f)
        if f != null
            ok = true
            f |> fwrite("// ")
            f |> fwrite(data)
            f |> fwrite("\n\n")
            f |> fwrite(code)

    send_response(JV(ok), id)


[rpc_call]
def files_list(id: uint64)
    var files: array<string>
    scan_dir(flowsDir, files)
    let flowsDirLen = length(flowsDir)
    for f in files
        f = f |> slice(flowsDirLen)
    print("< req files\n{files}\n")
    send_response(JV(files), id)
    // jsonRpc->sendError(server, "foobar", 0lf, null, id)


[rpc_call]
def lang_getCore(id: uint64)
    print("< req lang.getCore\n")
    var ok = false

    fopen("lang/core.json", "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                ok = false
                send_response(JV("{data}"), id)
    if !ok
        send_response(JV(null), id)


[rpc_call]
def lang_execute(code: string; id: uint64)
    print("< req run code\n{code}\n")
    send_response(JV("run! " + code), id)


def scan_dir(path: string; var res: array<string>; suffix = ".dasflow"): bool
    if !stat(path).is_dir
        return false
    fio::dir(path) <| $(n)
        if n == "." || n == ".."
            return
        let f = "{path}{n}"
        let fStat = stat(f)
        if !fStat.is_valid
            return
        if fStat.is_dir
            "{f}/" |> scan_dir(res)
        elif fStat.is_reg && f |> ends_with(suffix)
            res |> push(f)
    return true


options debugger