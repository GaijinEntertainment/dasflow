options rtti
options strict_smart_pointers
options remove_unused_symbols = false

require rtti
require ast
require fio
require strings

require daslib/json_boost
require daslib/defer
require daslib/strings_boost
require dasweb/agent_server_boost
require dasweb/array_boost


let
    operators = [[string "!"; "~"; "+="; "-="; "*="; "/="; "%="; "&="; "|="; "^="; "&&="; "||="; "^^="; "&&"; "||"; "^^"; "+"; "-";
                         "*"; "/"; "%"; "<"; ">"; "=="; "!="; "<="; ">="; "&"; "|"; "^"; "++"; "--"; "<<"; ">>"; "<<=";
                         ">>="; "<<<"; ">>>"; "<<<="; ">>>="; "+++"; "---"]]
    postOperators <- {{ "+++"=>"++"; "---"=>"--" }}


struct TypeDesc
    typeName: string
    mn: string
    baseMn: string
    requirements: array<string>
    isConst: bool
    isRef: bool
    isLocal: bool
    isBlock: bool
    isIterable: bool
    args: array<TypeArg>


struct TypeArg
    name: string
    mn: string


struct FuncDesc
    name: string
    mn: string
    resMn: string
    sideeffect: bool
    ctor: string
    args: array<FuncArg>
    requirements: array<string>


struct FuncArg
    name: string
    mn: string


struct LangDesc
    types: table<string; TypeDesc> // mangled name -> TypeDesc
    functions: array<FuncDesc> // FunctionDesc

struct LangExtraInfo
    funcAnnotations: array<string>

struct DumpContext
    modules: array<string>
    ignoredArgumentTypes: array<string>

def private getModule(name: string): rtti::Module?
    var res: rtti::Module?
    program_for_each_registered_module() <| $(mod)
        if mod.name == name
            res = mod
    return res


def dumpModules(ctx: DumpContext; path: string)

    var lang: LangDesc

    for modName in ctx.modules
        var mod = getModule(modName)
        if mod == null
            print("[E] module '{modName}' not found")
            continue
        ctx |> dumpModule(mod, lang)

    fopen(path, "wb") <| $(f)
        if f == null
            print("Unable to create file {path}\n")
            return
        print("write {path}\n")
        f |> fwrite(write_json(JV(lang)))


def private dumpModule(ctx: DumpContext; mod: rtti::Module?; var lang: LangDesc)

    let modName = "{mod.name}"

    print("mod {mod.name}\n")
    // mod |> for_each_typedef() <| $(typeName, tp)
    //     print("td {typeName} {tp} \n")
    // mod |> for_each_structure <| $(st)
    //     print("st {st.name}\n")
    // mod |> for_each_global <| $(gl)
    //     debug(gl.name)
    mod |> for_each_generic <| $(fn)
        ctx |> add_function(fn, modName, lang)
    mod |> for_each_function("") <| $(fn)
        ctx |> add_function(fn, modName, lang)

def add_function(ctx: DumpContext; fn: smart_ptr<ast::Function>&; modName: string; var lang: LangDesc)
    let fnName = "{fn.name}"
    var fnMn = "{fnName}("
    let reqFlow = fn.sideEffectFlags.modifyExternal || fn.sideEffectFlags.modifyArgument || fn.sideEffectFlags.accessGlobal || fn.sideEffectFlags.invoke || fn.sideEffectFlags.userScenario
    lang.functions |> emplace <| [[FuncDesc name=fnName, sideeffect=reqFlow]]
    var fun & = unsafe(lang.functions[length(lang.functions) - 1])

    var first = true
    for arg in fn.arguments
        let td = lang |> getTypeDesc(arg._type)
        // print("{td.typeName} {td.mn}\n")
        if ctx.ignoredArgumentTypes |> has_value(td.mn)
            continue

        var argType <- [[FuncArg name="{arg.name}", mn=td.mn]]
        fun.args |> emplace <| argType

        fnMn = "{fnMn}{first?"":","}{td.mn}"
        first = false

    if operators |> has_value(fnName)
        if length(fn.arguments) == 1 && postOperators |> key_exists(fnName)
            unsafe
                fun.ctor = "${fun.args[0].name}{(postOperators)?[fnName]}"
        else
            assert(length(fn.arguments) == 1 || length(fn.arguments) == 2)
            if length(fn.arguments) == 1
                fun.ctor = "{fnName}${fun.args[0].name}"
            else
                fun.ctor = "${fun.args[0].name} {fnName} ${fun.args[1].name}"

    if fn.sideEffectFlags._unsafe
        if !empty(fun.ctor)
            fun.ctor = "unsafe {fun.ctor}"
        else
            fun.ctor = "unsafe("
            for arg in fun.args
                fun.ctor += "{arg.name}, "
            fun.ctor = fun.ctor + ")"

    if modName != "$"
        fun.requirements <- [{string[1] modName}]

    var resTypeDesc = lang |> getTypeDesc(fn.result)
    fun.resMn = resTypeDesc.mn
    fun.mn = "{fnMn}):{resTypeDesc.mn}"


def is_iterable_type(ti: smart_ptr<TypeDecl>) : bool
    return true if !empty(ti.dim)
    return true if ti.isGoodArrayType
    return true if ti.isString
    return true if ti.isGoodIteratorType
    return true if ti.isRange
    return true if ti.isHandle && ti.annotation != null && ti.annotation.isIterable

    return false


def getTypeDesc(var lang: LangDesc; ti: smart_ptr<TypeDecl>): TypeDesc?
    let mangledName = ti |> get_mangled_name()

    if !key_exists(lang.types, mangledName)
        var t <- [[TypeDesc mn=mangledName, typeName=ti |> describe(), isConst=ti.isConst, isRef=ti.isRef, isLocal=ti.isLocal]]

        // print("{t.typeName} {t.mn}\n")
        // debug(t)
        t.baseMn = t.mn
        if ti.isConst
            t.baseMn = t.baseMn |> removePrefix("C")
        if ti.isRefType || ti.isRef
            t.baseMn = t.baseMn |> removePrefix("&", false)
        if ti.flags.temporary
            t.baseMn = t.baseMn |> removePrefix("#")
        if ti.flags._implicit
            t.baseMn = t.baseMn |> removePrefix("I")

        t.isIterable = ti |> is_iterable_type()

        t.isBlock = ti.isGoodBlockType
        for idx, argType in iter_range(ti.argTypes), ti.argTypes
            let argTypeDesc = lang |> getTypeDesc(argType)
            if argTypeDesc == null
                print("[E] argTypeDesc is null")
                continue
            t.args |> emplace <| [[TypeArg name=length(ti.argNames) > idx ? "{ti.argNames[idx]}" : "arg{idx+1}", mn=argTypeDesc.mn]]

        ti |> get_modules <| $(mod)
            if !empty(mod) && mod != "$"
                t |> add_req <| mod

        if t.typeName == "unspecified enumeration const"
            t.typeName = "enum const {t.baseMn}"

        lang.types[t.mn] <- t

    unsafe
        return (lang.types)?[mangledName]


def get_modules(ti: smart_ptr<TypeDecl>; blk: block<(mod: string): void>): void
    if ti.annotation != null && ti.annotation._module != null
        blk |> invoke("{ti.annotation._module.name}")
    if ti.structType != null && ti.structType._module != null
        blk |> invoke("{ti.structType._module.name}")
    if ti.enumType != null && ti.enumType._module != null
        blk |> invoke("{ti.enumType._module.name}")

    if ti.firstType != null
        get_modules(ti.firstType, blk)
    if ti.secondType != null
        get_modules(ti.secondType, blk)

    if ti._module != null
        blk |> invoke("{ti._module.name}")


def add_req(var td: TypeDesc; req: string)
    if !td.requirements |> has_value(req)
        td.requirements |> push <| req


def dumpExtra(ctx: DumpContext; path: string)
    var extra: LangExtraInfo

    for modName in ctx.modules
        var mod = getModule(modName)
        if mod == null
            print("[E] module '{modName}' not found")
            continue

        mod |> module_for_each_annotation <| $(value)
            if value.isFunctionAnnotation
                extra.funcAnnotations |> push <| string(value.name)

    fopen(path, "wb") <| $(f)
        if f == null
            print("Unable to create file {path}\n")
            return
        print("write {path}\n")
        f |> fwrite(write_json(JV(extra)))


def JV(val: LangDesc)
    var types <- [{ for value in values(val.types); JV(value) }]
    defer_delete(types)
    return JV({{"functions"=>JV(val.functions); "types"=>JV(types)}})


def JV(val: TypeDesc)
    var res <- {{"typeName"=>JV(val.typeName); "mn"=>JV(val.mn)}}
    if val.mn != val.baseMn
        res["baseMn"] = JV(val.baseMn)
    if val.isConst
        res["isConst"] = JV(val.isConst)
    if val.isRef
        res["isRef"] = JV(val.isRef)
    if val.isLocal
        res["isLocal"] = JV(val.isLocal)
    if val.isBlock
        res["isBlock"] = JV(val.isBlock)
    if val.isIterable
        res["isIterable"] = JV(val.isIterable)
    if !empty(val.args)
        res["args"] = JV(val.args)
    if !empty(val.requirements)
        res["requirements"] = JV(val.requirements)
    return JV(res)


def JV(val: FuncDesc)
    var res <- {{"name"=>JV(val.name); "args"=>JV(val.args); "resMn"=>JV(val.resMn); "mn"=>JV(val.mn)}}
    if val.sideeffect
        res["sideeffect"] = JV(val.sideeffect)
    if !empty(val.ctor)
        res["ctor"] = JV(val.ctor)
    if !empty(val.requirements)
        res["requirements"] = JV(val.requirements)
    return JV(res)

def JV(val: LangExtraInfo)
    return JV({{"funcAnnotations"=>JV(val.funcAnnotations)}})

def removePrefix(str: string; prefix: string; showError = true)
    if str |> starts_with(prefix)
        return str |> slice(length(prefix))
    if showError
        print("[E] removePrefix: {str} {prefix}\n")
    return str
