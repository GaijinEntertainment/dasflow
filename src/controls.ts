import Rete from "rete"
import {NodeEditor} from "rete/types/editor"
import {LangType} from "./components";

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


const VueMultilineLabelControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData'],
    template: '<textarea rows="4" :readonly="readonly" :value="value" @input="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>',
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

export class MultilineLabelControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueMultilineLabelControl
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


const VueCheckBoxControl = {
    props: ['readonly', 'emitter', 'ikey', 'defaultValue', 'getData', 'putData'],
    template: '<div> <button type="button"> <label for="checkbox_id">main</label> </button>\n' +
    '<input type="checkbox" id="checkbox_id" :readonly="readonly" :value="value" v-model="selected" @change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""> </div>',
    data() {
        return {
            value: this._props.defaultValue,
            selected: this._props.defaultValue
        }
    },
    methods: {
        change(e) {
            this.value = e.target.checked
            this.update()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        }
    },
    mounted() {
        if(this.getData(this.ikey) != undefined)
            this.value = this.getData(this.ikey)
        else
            this.value = this._props.defaultValue
        this.selected = this.value
    }
}

export class CheckBoxControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, defaultValue: boolean, readonly: boolean = false) {
        super(key)
        this.component = VueCheckBoxControl
        this.props = {emitter, ikey: key, defaultValue, readonly}
    }

    setValue(val: boolean) {
        this.vueContext.value = val
    }
}


const VueComboBoxControl = {
    props: ['readonly', 'emitter', 'ikey', 'keys', 'getData', 'putData'],
    template: '<select :value="value" v-on:change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop="">\n' +
        '   <option v-for="(v,i) of keys" :selected="i==0">{{ v }}</option>\n' +
        '</select>',
    data() {
        return {value: "",}
    },
    methods: {
        change(e) {
            this.value = e.target.value
            this.update()
            this.onChange()
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        },
        onChange() { console.assert() }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class ComboBoxControl extends Rete.Control {
    component: any
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

const VueAutocomplitComboBoxControl = {
    props: ['readonly', 'emitter', 'ikey', 'keys', 'getData', 'putData'],
    template: '<div> <input list="combobox_id" :value="value" @change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>\n' +
        '<datalist id="combobox_id">\n' +
        '   <option v-for="(v,i) in keys" :value="v">{{ v }}</option>\n' +
        '</datalist> </div>',
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

export class AutocomplitComboBoxControl extends Rete.Control {
    component: unknown
    props: { [key: string]: unknown }
    vueContext: any

    constructor(emitter: NodeEditor | null, key: string, keys: { [key: string]: any }, readonly: boolean = false) {
        super(key)
        this.component = VueAutocomplitComboBoxControl
        this.props = {emitter, ikey: key, readonly, keys}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}

const VueTextInputControl = {
    props: ['readonly', 'emitter', 'ikey', 'getData', 'putData', 'bindControl'],
    template: '<span>' +
        '  <select v-if="this.values" :value="value" @change="change($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop="">\n' +
        '    <option v-for="v of values" :selected="this.value == v">{{ v }}</option>\n' +
        '  </select>' +
        '  <input v-else type="text" :readonly="readonly" v-model="value" @onfocusout="change($event)" @onblur="change($event)" @input="change($event)" @keyup="keyup($event)" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop=""/>' +
        '</span>',
    data() {
        return {value: "", values: null}
    },
    methods: {
        change(e) {
            this.setValue(e.target.value, this.getData(this.ikey))
        },
        keyup(e) {
            if (e.keyCode == 13)
                this.change(e)
        },
        update() {
            if (this.ikey)
                this.putData(this.ikey, this.value)
            this.emitter.trigger('process')
        },
        setValue(value, prevValue) {
            const validValue = this.bindControl.validate(value, this.value)
            this.value = validValue != value && prevValue ? prevValue : validValue
            this.update()
        }
    },
    mounted() {
        this.value = this.getData(this.ikey)
    }
}

export class TextInputControl extends Rete.Control {
    get values(): string[] | undefined {
        return this._values
    }

    set values(value: string[] | undefined) {
        this._values = value
        if (this.vueContext)
            this.vueContext.values = value
        else
            console.error("vueContext in not yet inited")
    }

    component: unknown
    props: { [key: string]: unknown }
    vueContext: any
    validator?: RegExp
    defaultValue: string
    private _values?: string[]

    constructor(emitter: NodeEditor | null, key: string, readonly: boolean = false) {
        super(key)
        this.component = VueTextInputControl
        this.props = {emitter, ikey: key, readonly, bindControl: this}
    }

    validate(val: string): string {
        if (this.validator && !this.validator.test(val))
            return this.defaultValue
        if (this._values) {
            for (const predefineValue of this._values) {
                if (predefineValue == val)
                    return val
            }
            return this._values[0]
        }
        return val
    }

    setValue(val: string) {
        this.vueContext.setValue(this.validate(val))
        this.vueContext.update()
    }
}


const VueLangTypeSelectControl = {
    props: ['readonly', 'emitter', 'ikey', 'types', 'getData', 'putData'],
    template: '<select :value="value" @change="change($event)" style="width: 120pt" @dblclick.stop="" @pointerdown.stop="" @pointermove.stop="">\n' +
        '   <option v-for="v of types.values()" v-if="v.desc.isLocal && !v.desc.isRef && !v.desc.isBlock && !v.isAny && !v.isVoid" :value="v.desc.mn" :selected="this.typeName == v.desc.mn">{{ v.desc.typeName }}</option>\n' +
        '</select>',
    data() {
        return { value: ""}
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

    constructor(emitter: NodeEditor | null, key: string, types: Map<string, LangType>, readonly: boolean = false) {
        super(key)
        this.component = VueLangTypeSelectControl
        this.props = {emitter, ikey: key, readonly, types}
    }

    setValue(val: string) {
        this.vueContext.value = val
    }
}

