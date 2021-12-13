import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {FilesRpc} from "./rpc"
import {SubEvent} from 'sub-events'
import {ConstructDasCtx, TopLevelDasComponent} from "./dasComponents"


export class DasflowContext {
    EDITOR_VER = 'dasflow@0.0.1'

    onCurrentNameChange = new SubEvent<string>()

    private set currentFile(value: string) {
        this._currentFile = value
        this.onCurrentNameChange.emit(value)
    }

    get currentFile(): string {
        return this._currentFile
    }

    private readonly websocket: JsonRpcWebsocket
    public editor: NodeEditor
    private _currentFile = 'default.dasflow'


    constructor(websocket: JsonRpcWebsocket) {
        this.websocket = websocket
    }

    async loadFile(path: string): Promise<boolean> {
        let res = FilesRpc.load(this.websocket, this.editor, path)
        res.then((res) => {
            if (res)
                this.currentFile = path
        })
        return res
    }

    async reload(): Promise<boolean> {
        return FilesRpc.load(this.websocket, this.editor, this.currentFile)
    }

    constructDas(): ConstructDasCtx {
        const ctx = new ConstructDasCtx(this.editor)
        for (const node of this.editor.nodes) {
            let component = this.editor.components.get(node.name)
            if (component instanceof TopLevelDasComponent)
                component.constructDas(node, ctx)
        }
        return ctx
    }

    async save(): Promise<boolean> {
        const dasCtx = this.constructDas()
        const hasErrors = dasCtx.hasErrors()
        if (hasErrors) {
            dasCtx.logErrors()
        }
        return FilesRpc.save(this.websocket, this.editor, !hasErrors ? dasCtx.code : "", this.currentFile)
    }

    async firstStart(): Promise<boolean> {
        return this.reload().then((ok) => {
            this.currentFile = ok ? this._currentFile : ""
            return ok
        })
    }

    async refreshFilesList(): Promise<string[]> {
        // todo: cache, store
        return FilesRpc.list(this.websocket)
    }

    close() {
        this.currentFile = ""
        this.editor.clear()
    }
}