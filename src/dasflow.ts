import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {FilesRpc} from "./rpc"
import {SubEvent} from 'sub-events'


export class DasflowContext {
    EDITOR_VER = 'dasflow@0.0.1'

    onCurrentNameChange = new SubEvent<string>()

    private set currentFile(value: string) {
        // todo: emit change
        this._currentFile = value
        this.onCurrentNameChange.emit(value)
    }

    get currentFile(): string {
        return this._currentFile
    }

    private websocket: JsonRpcWebsocket
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

    async save(): Promise<boolean> {
        return FilesRpc.save(this.websocket, this.editor, this.currentFile)
    }

    async firstStart() {
        this.reload().then((ok) => {
            this.currentFile = ok ? this._currentFile : ""
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