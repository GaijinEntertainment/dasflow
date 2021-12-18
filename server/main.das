options rtti

require ast
require rtti
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

    program_for_each_registered_module() <| $(mod)

        // if mod.name != "$" && mod.name != "math"
        //     return
        print("{mod.name} {mod}\n")


        let mods = [[string[] "$"; "math"; "strings"]]
        if ! mods |> has_value("{mod.name}")
            return

        lang = new LangDesc

        let modName = "{mod.name}"


        print("mod {mod.name}\n")
        // mod |> for_each_typedef() <| $(typeName, tp)
        //     print("td {typeName} {tp} \n")
        // mod |> for_each_structure <| $(st)
        //     print("st {st.name}\n")
        using <| $(var mg: ModuleGroup#)
            mod |> module_for_each_function() <| $(fn)

                let fnName = clone_string(fn.name)
                lang.functions |> emplace <| [[FuncDesc name=fnName]]
                var fun & = unsafe(lang.functions[length(lang.functions) - 1])

                var first = true
                for arg in fn
                    let td = getTypeDesc(type_info(arg), modName)
                    // print("{td.typeName} {td.mn}\n")
                    fun.args |> emplace <| [[FuncArg name=clone_string(arg.name), mn=td.mn]]
                    first = false

                var resTypeDesc = getTypeDesc(fn.result, modName)
                fun.resultType = resTypeDesc.mn


                // print("{fun.name}(): {fun.resultMN}\n")

            fopen("lang/{mod.name}.json", "wb") <| $(f)
                if f == null
                    print("Unable to create file lang/{mod.name}.json\n")
                    return
                print("write lang/{mod.name}.json\n")
                f |> fwrite(write_json(JV(lang)))

                // let decl <- parse_mangled_name(fun.resultType, mg, mod)
                // if decl._module != null
                //     debug(decl)
            // debug(types)
            // debug(functions)

var lang: LangDesc?

struct LangDesc
    types: table<string; TypeDesc> // mangled name -> TypeDesc
    functions: array<FuncDesc> // FunctionDesc


def getTypeDesc(ti: TypeInfo const?; mod: string): TypeDesc?
    let mangledName = ti |> get_mangled_name()
    // print("{mangledName}\n")
    // if mangledName == "CE"
    //     debug(ti)
    // print("{ti |> describe()}\n")

    if !key_exists(lang.types, mangledName)
        var t <- [[TypeDesc mn=mangledName, typeName=ti |> describe(), constType=ti.isConst, refType=ti.isRef]]
        // print("{t.typeName} {t.mn}\n")
        // if ti.enumType != null
        //     t |> add_req <| "{ti.enumType.module_name}"
        // if ti.structType != null
        //     print("struct\n")
        //     t |> add_req <| "{ti.structType.module_name}"
        if mod != "$"
            t |> add_req <| mod

        lang.types[t.mn] <- t

    return unsafe(lang.types |> find_for_edit(mangledName))


def add_req(var td: TypeDesc; req: string)
    if !td.requirements |> has_value(req)
        td.requirements |> push <| req

def JV(val: TypeDesc)
    var res <- {{"typeName" => JV(val.typeName); "mn" => JV(val.mn)}}
    if val.constType
        res["constType"] = JV(val.constType)
    if val.refType
        res["refType"] = JV(val.refType)
    if !empty(val.requirements)
        res["requirements"] = JV(val.requirements)
    return JV(res)

struct TypeDesc
    typeName: string
    mn: string
    requirements: array<string>
    constType: bool
    refType: bool

struct FuncDesc
    name: string
    resultType: string
    args: array<FuncArg>

struct FuncArg
    name: string
    mn: string

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
        send_response(JVNull(), id)


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
        send_response(JVNull(), id)


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