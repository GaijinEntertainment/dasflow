import {Socket} from "rete"

export interface LangTypeDesc {
    name: string
    default?: string
    ctor?: string
    group?: string
    validator?: string
    enum?: string[]
    struct?: { name: string, type: string }[]
}

export interface LangFunctionDesc {
}

export interface LangCoreDesc {
    logicType: string
    types: LangTypeDesc[]
    functions: LangFunctionDesc[]
}


export class LangType {
    desc: LangTypeDesc
    validator?: RegExp
    socket: Socket
    defaultValue: string
    ctor: (s: string, args: { [key: string]: string }) => string = s => s
}