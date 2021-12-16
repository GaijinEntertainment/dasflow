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
    ctor: (s: string) => string = s => s

    get name(): string | undefined {
        return this.desc.name
    }

    get group(): string | undefined {
        return this.desc.group ?? this.desc.name
    }

    get defaultValue(): string {
        return this.desc.default ?? ""
    }
}