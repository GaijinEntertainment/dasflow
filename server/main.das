options rtti
options strict_smart_pointers
options debugger
require daslib/debug

require ast
require rtti
require strings
require fio

require dasweb/web_server
require dasweb/web_server_debug
require dasweb/jsonrpc_boost
require dasweb/agent_jsonrpc_boost

require lang

var jsonRpc: JsonRpcHandler?
var server: WebServer?

var flowsDir = "flows/"
var compilerPath: string

struct CompileError
    line : uint
    message : string
    file : string
    fixme : string
    extra : string

struct SaveStatus
    saved : bool
    compiled : bool
    errors : array<CompileError>

[export]
def main()
    initialize()
    while true
        tick_agent()
        sleep(10u)

[export]
def initialize()
    print("[re]start main.das\n")

    let args <- get_command_line_arguments()
    compilerPath = args[0]

    start_agent()

    var ctx: DumpContext
    ctx.modules <- [{string[] "$"; "math"; "strings"}]
    ctx.ignoredArgumentTypes <- [{string[] "C_c"; "C_l"}]
    dumpModules(ctx, "lang/dump.json")


[export]
def act()
    tick_agent()


[export]
def shutdown()
    print("shutdown main.das\n")



[auto_rpc_call(name="files.load")]
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
        send_response(JVNull(), id)


[auto_rpc_call(name="files.save")]
def files_save(filePath: string; data: string; code: string; id: uint64)
    let path = flowsDir + filePath
    print("< req run save data `{path}`\n{data}\n")
    var saveOkay = false
    fopen(path, "wb") <| $(f)
        if f != null
            saveOkay = true
            f |> fwrite("// ")
            f |> fwrite(data)
            f |> fwrite("\n\n")
            f |> fwrite(code)

    var inscope access <- make_file_access("")

    using <| $(var mg:ModuleGroup)
        using <| $(var cop:CodeOfPolicies)
            cop.aot_module = true
            compile_file(path, access, unsafe(addr(mg)), cop) <| $(compileOkay, program, output)
                var status : SaveStatus
                status.saved = saveOkay
                status.compiled = compileOkay
                for err in program.errors
                    status.errors |> emplace([[CompileError message=string(err.what), file=string(err.at.fileInfo.name),
                                                            line=err.at.line, fixme=string(err.fixme), extra=string(err.extra)]])
                debug(program)
                debug(output)
                debug(status)
                send_response(JV(status), id)


[auto_rpc_call(name="files.list")]
def files_list(id: uint64)
    var files: array<string>
    scan_dir(flowsDir, files)
    let flowsDirLen = length(flowsDir)
    for f in files
        f = f |> slice(flowsDirLen)
    print("< req files\n{files}\n")
    send_response(JV(files), id)
    // jsonRpc->sendError(server, "foobar", 0lf, null, id)


[auto_rpc_call(name="lang.getCore")]
def lang_getCore(id: uint64)
    print("< req lang.getCore\n")
    var ok = false

    fopen("lang/core.json", "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                ok = false
                send_response(JV("{data}"), id)
    if !ok
        send_response(JVNull(), id)



[auto_rpc_call(name="lang.get")]
def lang_get(id: uint64)
    print("< req lang.get\n")
    var ok = false

    fopen("lang/dump.json", "rb") <| $(f)
        if f != null
            f |> fread <| $(data)
                ok = false
                send_response(JV("{data}"), id)
    if !ok
        send_response(JVNull(), id)



[auto_rpc_call(name="lang.execute")]
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