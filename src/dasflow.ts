import {JsonRpcWebsocket} from "jsonrpc-client-websocket"
import {NodeEditor} from "rete/types/editor"
import {FilesRpc, SaveResult, FileType} from "./rpc"
import {SubEvent} from 'sub-events'
import {ConstructDasCtx, LangComponent} from "./components"
import {deepClone} from "./deep_clone"

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

    public get ctxFile(): string {
        return this._currentFile
    }

    private readonly websocket: JsonRpcWebsocket
    public editor: NodeEditor
    private _currentFile = 'demo.dasflow'
    private type = FileType.Script
    private logComments = new Set()
    private compileComments = new Set()
    private modulesNodes = new Map<string, Node[]>()


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

    async getAllModulesData(nodes) {
        for (const node of nodes) {
            if (node.name != 'Module')
                continue

            let data = await this.getFileData(node.data.module, FileType.Module)

            if (data == "null") {
                return []
            }
            const curNodesCtx = this.editor.toJSON() // nodes + comments
            await this.editor.fromJSON(JSON.parse(data))

            const nodes: Node[] = []
            for (let node of this.editor.nodes) {
                if (node.name == 'Input' || node.name == 'InputFlow' || node.name == 'Output' || node.name == 'OutputFlow')
                    nodes.push(deepClone(node))
            }
            this.modulesNodes.set(node.data.module, nodes)

            await this.editor.fromJSON(curNodesCtx)
        }
    }

    getModuleNodes(name: string) {
        return this.modulesNodes.get(name)
    }

    loadFile(path: string, fileType: string): Promise<boolean> {
        this.compileComments.clear()
        this.logComments.clear()
        let res = FilesRpc.load(this.websocket, this.editor, path, fileType)
        res.then((res) => {
            this.type = fileType
            this.currentFile = path
        })
        return res
    }

    getFileData(path: string, fileType: string): Promise<string> {
        return FilesRpc.getData(this.websocket, path, fileType)
    }

    async reload(): Promise<boolean> {
        this.compileComments.clear()
        this.logComments.clear()
        return FilesRpc.load(this.websocket, this.editor, this.currentFile, this.type)
    }

    async constructDas(): Promise<ConstructDasCtx> {
        const ctx = new ConstructDasCtx(this.editor, this.getModuleNodes, this)
        await this.getAllModulesData(this.editor.nodes)

        for (const node of this.editor.nodes) {
            let component = <LangComponent>this.editor.components.get(node.name)
            if (component.topLevel)
                component.constructDas(node, ctx)
        }
        ctx.build()
        return ctx
    }

    displayResult(result) {
        const button = document.getElementById("show_button_id")
        button!.hidden = true
        const sim = document.getElementById("sim_id")
        sim!.hidden = false
        const sim_res = document.getElementById("sim_res_id")
        sim_res!.innerHTML = result
    }

    async save(): Promise<SaveResult> {
        this.deleteComments(this.logComments)
        this.deleteComments(this.compileComments)

        const dasCtx = await this.constructDas()
        const hasErrors = dasCtx.hasErrors()
        if (hasErrors) {
            dasCtx.logErrors()
        }
        console.log(dasCtx.code)

        for (const comment of this.logComments) {
            // @ts-ignore
            this.editor?.trigger('removecomment', ({ comment }))
        }

        return FilesRpc.save(this.websocket, this.editor, !hasErrors ? dasCtx.code : "", this.currentFile, this.type, dasCtx.getMainFunc()).then(res => {
            if (res.errors.length > 0) {
                console.log(res.errors)
                dasCtx.addNativeErrors(res.errors, this.currentFile)
            }

            if (res.simulated)
                this.displayResult(res.executeResult)

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
            this.type = ok ? this.type : FileType.None
            return ok
        })
    }

    async refreshFilesList(fileType: string): Promise<string[]> {
        // todo: cache, store
        return FilesRpc.list(this.websocket, fileType)
    }

    close() {
        this.currentFile = ""
        this.type = FileType.None
        this.editor.clear()
    }
}