export interface LangTypeDesc {
    mn: string
    baseMn?: string
    typeName: string
    isConst?: boolean
    isRef?: boolean
    canCopy?: boolean
    default?: string
    ctor?: string
    group?: string
    validator?: string
    enum?: string[]
    struct?: { name: string, mn: string }[]
    requirements?: string[]
}

interface LangFunctionArgDesc {
    name: string
    mn: string
}

export interface LangFunctionDesc {
    name: string
    resMn: string
    args: LangFunctionArgDesc[]
}

export interface LangCoreDesc {
    logicType: string
    anyType: string
    voidType: string
    types: LangTypeDesc[]
    functions: LangFunctionDesc[]
}

export interface LangDesc {
    types: LangTypeDesc[]
    functions: LangFunctionDesc[]
}
