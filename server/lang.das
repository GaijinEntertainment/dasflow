options rtti
options remove_unused_symbols = false

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
    sideeffect: bool
    ctor: string
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

    var faNum = 0
    mod |> for_each_function("") <| $(fn)
        faNum += 1
        // fa.result

        let fnName = "{fn.name}"
        let reqFlow = fn.sideEffectFlags.modifyExternal || fn.sideEffectFlags.modifyArgument || fn.sideEffectFlags.accessGlobal || fn.sideEffectFlags.invoke || fn.sideEffectFlags.userScenario
        lang.functions |> emplace <| [[FuncDesc name=fnName, sideeffect=reqFlow]]
        var fun & = unsafe(lang.functions[length(lang.functions) - 1])


        if fn.sideEffectFlags._unsafe
            fun.ctor = "unsafe({fnName}($args))"

        for arg in fn.arguments
            let td = lang |> getTypeDesc(arg._type)
            // print("{td.typeName} {td.mn}\n")
            if ctx.ignoredArgumentTypes |> has_value(td.mn)
                continue

            var argType <- [[FuncArg name="{arg.name}", mn=td.mn]]
            fun.args |> emplace <| argType

        var resTypeDesc = lang |> getTypeDesc(fn.result)
        fun.resMn = resTypeDesc.mn


def getTypeDesc(var lang: LangDesc; ti: smart_ptr<TypeDecl>): TypeDesc?
    let mangledName = ti |> get_mangled_name()

    if !key_exists(lang.types, mangledName)
        var t <- [[TypeDesc mn=mangledName, typeName=ti |> describe(), isConst=ti.isConst, isRef=ti.isRef, canCopy=ti.canCopy]]

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

        ti |> get_modules <| $(mod)
            if !empty(mod) && mod != "$"
                t |> add_req <| mod

        if t.typeName == "unspecified enumeration const"
            t.typeName = "enum const {t.baseMn}"

        lang.types[t.mn] <- t

    return unsafe(lang.types |> find_for_edit(mangledName))


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


def JV(val: LangDesc)
    var types <- [{ for val in values(val.types); JV(val) }]
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
    if val.canCopy
        res["canCopy"] = JV(val.canCopy)
    if !empty(val.requirements)
        res["requirements"] = JV(val.requirements)
    return JV(res)


def JV(val: FuncDesc)
    var res <- {{"name"=>JV(val.name); "args"=>JV(val.args); "resMn"=>JV(val.resMn)}}
    if val.sideeffect
        res["sideeffect"] = JV(val.sideeffect)
    if !empty(val.ctor)
        res["ctor"] = JV(val.ctor)
    return JV(res)


def removePrefix(str: string; prefix: string; showError = true)
    if str |> starts_with(prefix)
        return str |> slice(length(prefix))
    if showError
        print("[E] removePrefix: {str} {prefix}\n")
    return str
