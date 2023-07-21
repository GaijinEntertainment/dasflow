import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {FilesRpc, SaveResult} from "./rpc"
import {SubEvent} from 'sub-events'
import {ConstructDasCtx, LangComponent} from "./components"


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
    private _currentFile = 'demo.dasflow'
    private logComments = new Set()
    private compileComments = new Set()


    constructor(websocket: JsonRpcWebsocket) {
        this.websocket = websocket
    }

    storeComment(comment): void {
        if (comment.text) {
            if (comment.text[0] == '\u00A0') {
                if (comment.text[1] == '\u00A0')
                    this.compileComments.add(comment)
                else
                    this.logComments.add(comment)
            }
        }
    }

    deleteComments(comments: Set<any>) {
        for (const comment of comments) {
            // @ts-ignore
            this.editor?.trigger('removecomment', ({ comment }))
        }
        comments.clear()
    }

    async loadFile(path: string): Promise<boolean> {
        this.compileComments.clear()
        this.logComments.clear()
        let res = FilesRpc.load(this.websocket, this.editor, path)
        res.then((res) => {
            this.currentFile = path
        })
        return res
    }

    async reload(): Promise<boolean> {
        this.compileComments.clear()
        this.logComments.clear()
        return FilesRpc.load(this.websocket, this.editor, this.currentFile)
    }

    constructDas(): ConstructDasCtx {
        const ctx = new ConstructDasCtx(this.editor)
        for (const node of this.editor.nodes) {
            let component = <LangComponent>this.editor.components.get(node.name)
            if (component.topLevel)
                component.constructDas(node, ctx)
        }
        ctx.build()
        return ctx
    }

    async save(): Promise<SaveResult> {
        this.deleteComments(this.logComments)
        this.deleteComments(this.compileComments)

        const dasCtx = this.constructDas()
        const hasErrors = dasCtx.hasErrors()
        if (hasErrors) {
            dasCtx.logErrors()
        }
        console.log(dasCtx.code)

        for (const comment of this.logComments) {
            // @ts-ignore
            this.editor?.trigger('removecomment', ({ comment }))
        }

        return FilesRpc.save(this.websocket, this.editor, !hasErrors ? dasCtx.code : "", this.currentFile).then(res => {
            if (res.errors.length > 0) {
                console.log(res.errors)
                dasCtx.addNativeErrors(res.errors, this.currentFile)
            }
            let temp = new Set(this.logComments)
            for (const comment of temp) {
                // @ts-ignore
                this.editor?.trigger('addcomment', ({ type: 'inline', text: comment.text, position: [comment.x, comment.y] }))
                this.logComments.delete(comment)
            }
            return res
        })
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