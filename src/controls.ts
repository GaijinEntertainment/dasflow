import Rete from "rete"
import {NodeEditor} from "rete/types/editor"
import {LangType} from "./lang"

const VueLabelControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
    template: '<input type="text" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
    data() {
        return {value: "",}
    },
    methods: {
        change(e) {
            this.value = e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class LabelControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueLabelControl
        this.props = {emitter, ikey: key, readonly}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}

const VueNumControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
    template: '<input type="number" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
    data() {
        return {value: 0,}
    },
    methods: {
        change(e) {
            this.value = +e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class NumControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueNumControl
        this.props = {emitter, ikey: key, readonly}
    }

    setValue(val: number) {
        this.vueContext.value = val
    }
}


const VueComboBoxControl = {
    props: ['readonly', 'emitter', 'ikey', 'keys', 'getData', 'putData'],
    template: '<select :value="value" v-on:change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop="">\n' +
        '   <option v-for="(v,k,i) of keys" :selected="i==0">{{ k }}</option>\n' +
        '</select>',
    data() {
        return {value: "",}
    },
    methods: {
        change(e) {
            this.value = e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class ComboBoxControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, keys: { [key: string]: any }, readonly: boolean = false) {
        super(key)
        this.component = VueComboBoxControl
        this.props = {emitter, ikey: key, readonly, keys}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}

const VueTextInputControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData', 'validator', 'defaultValue'],
    template: '<input type="text" :readonly="readonly" v-model="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
    data() {
        return {value: ""}
    },
    methods: {
        change(e) {
            this.setValue(e.target.value)
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        },
        setValue(value) {
            if (this.validator) {
                const reg: RegExp = this.validator
                if (!reg.test(value)) {
                    this.value = this.defaultValue
                    this.update()
                    return
                }
            }
            this.value = value
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class TextInputControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, validator: RegExp | undefined, defaultValue: string, readonly: boolean = false) {
        super(key)
        this.component = VueTextInputControl
        this.props = {emitter, ikey: key, readonly, defaultValue, validator}
    }

    setValue(val: number) {
        this.vueContext.setValue(val)
    }
}


const VueLangTypeSelectControl = {
    props: ['readonly', 'emitter', 'ikey', 'types', 'getData', 'putData'],
    template: '<select :value="value" v-on:change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop="">\n' +
        '   <option v-for="v of types" :selected="this.value == v.desc.name">{{ v.desc.name }}</option>\n' +
        '</select>',
    data() {
        return {value: "",}
    },
    methods: {
        change(e) {
            this.value = e.target.value
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class LangTypeSelectControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, types: LangType[], readonly: boolean = false) {
        super(key)
        this.component = VueLangTypeSelectControl
        this.props = {emitter, ikey: key, readonly, types}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}

