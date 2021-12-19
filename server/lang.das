options rtti

require rtti
require ast
require fio
require strings

require daslib/json_boost
require daslib/defer


struct TypeDesc
    typeName: string
    mn: string
    baseMn: string
    requirements: array<string>
    isConst: bool
    isRef: bool
    canCopy: bool


struct FuncDesc
    name: string
    resMn: string
    args: array<FuncArg>


struct FuncArg
    name: string
    mn: string


struct LangDesc
    types: table<string; TypeDesc> // mangled name -> TypeDesc
    functions: array<FuncDesc> // FunctionDesc

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
    mod |> module_for_each_function() <| $(fn)

        let fnName = clone_string(fn.name)
        lang.functions |> emplace <| [[FuncDesc name=fnName]]
        var fun & = unsafe(lang.functions[length(lang.functions) - 1])

        var first = true
        for arg in fn
            let ti = type_info(arg)
            let td = lang |> getTypeDesc(ti, modName)
            // print("{td.typeName} {td.mn}\n")
            if ctx.ignoredArgumentTypes |> has_value(td.mn)
                continue
            var argType <- [[FuncArg name=clone_string(arg.name), mn=td.mn]]
            fun.args |> emplace <| argType
            first = false

        var resTypeDesc = lang |> getTypeDesc(fn.result, modName)
        fun.resMn = resTypeDesc.mn


def getTypeDesc(var lang: LangDesc; ti: TypeInfo const?; mod: string): TypeDesc?
    let mangledName = ti |> get_mangled_name()
    // print("{mangledName}\n")
    // if mangledName == "CE"
    //     debug(ti)
    // print("{ti |> describe()}\n")

    if !key_exists(lang.types, mangledName)
        var t <- [[TypeDesc mn=mangledName, typeName=ti |> describe(), isConst=ti.isConst, isRef=ti.isRef, canCopy=ti.canCopy]]
        // print("{t.typeName} {t.mn}\n")
        // if ti.enumType != null
        //     t |> add_req <| "{ti.enumType.module_name}"
        // if ti.structType != null
        //     print("struct\n")
        //     t |> add_req <| "{ti.structType.module_name}"
        t.baseMn = t.mn
        if ti.isConst
            t.baseMn = t.baseMn |> removePrefix("C")
        if ti.isRef
            t.baseMn = t.baseMn |> removePrefix("&")
        if ti.isTemp
            t.baseMn = t.baseMn |> removePrefix("#")
        if ti.isImplicit
            t.baseMn = t.baseMn |> removePrefix("I")

        if mod != "$"
            t |> add_req <| mod

        lang.types[t.mn] <- t

    return unsafe(lang.types |> find_for_edit(mangledName))


def add_req(var td: TypeDesc; req: string)
    if !td.requirements |> has_value(req)
        td.requirements |> push <| req


def JV(val: LangDesc)
    var types <- [{ for val in values(val.types); JV(val) }]
    defer_delete(types)
    return JV({{"functions"=>JV(val.functions); "types"=>JV(types)}})


def JV(val: TypeDesc)
    var res <- {{"typeName"=>JV(val.typeName); "mn"=>JV(val.mn); "baseMn"=>JV(val.baseMn)}}
    if val.isConst
        res["isConst"] = JV(val.isConst)
    if val.isRef
        res["isRef"] = JV(val.isRef)
    if val.canCopy
        res["canCopy"] = JV(val.canCopy)
    if !empty(val.requirements)
        res["requirements"] = JV(val.requirements)
    return JV(res)

// def JV(val: FuncArg)
//     var res <- {{"name"=>JV(val.name); "mn"=>JV(val.mn)}}
//     return JV(res)

def removePrefix(str: string; prefix: string)
    if str |> starts_with(prefix)
        return str |> slice(length(prefix))
    print("[E] removePrefix: {str} {prefix}\n")
    return str
