interface LangTypeArgDesc {
    name: string
    mn: string
}

export interface LangTypeDesc {
    mn: string
    baseMn?: string
    typeName: string
    isConst?: boolean
    isRef?: boolean
    isLocal?: boolean
    isIterable?: boolean
    default?: string
    ctor?: string
    validator?: string
    enum?: string[]
    requirements?: string[]
    isBlock?: boolean
    args?: LangTypeArgDesc[]
}

interface LangFunctionArgDesc {
    name: string
    mn: string
}

export interface LangFunctionDesc {
    name: string
    mn: string
    resMn: string
    sideeffect?: boolean
    unsafe?: boolean
    ctor?: string;
    args: LangFunctionArgDesc[]
    requirements?: string[]
}

export interface LangCoreDesc {
    logicType: string
    anyTypes: string[]
    voidTypes: string[]
    types?: LangTypeDesc[]
    functions?: LangFunctionDesc[]
}

export interface LangDesc {
    types?: LangTypeDesc[]
    functions?: LangFunctionDesc[]
}

export interface LangExtraInfo {
    funcAnnotations: string[]
}
