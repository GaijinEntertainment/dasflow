import Rete from "rete"
import {NodeEditor} from "rete/types/editor"

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