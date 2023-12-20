export function deepClone(obj, clonedObjects = new WeakMap()) {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    // Check if the object has already been cloned to avoid cyclic references
    if (clonedObjects.has(obj)) {
        return clonedObjects.get(obj)
    }

    if (Array.isArray(obj)) {
        const clonedArray: any[] = []
        clonedObjects.set(obj, clonedArray)

        for (let i = 0; i < obj.length; i++) {
            clonedArray[i] = deepClone(obj[i], clonedObjects)
        }
        return clonedArray
    }

    if (obj instanceof Map) {
        let clonedMap = new Map()
        clonedObjects.set(obj, clonedMap)

        for (let [key, value] of obj) {
            clonedMap.set(deepClone(key, clonedObjects), deepClone(value, clonedObjects))
        }

        return clonedMap
    }

    if (typeof obj === 'object') {
        const clonedObject = {}
        clonedObjects.set(obj, clonedObject)

        for (const key in obj) {
            if (Object.hasOwnProperty.call(obj, key)) {
                clonedObject[key] = deepClone(obj[key], clonedObjects)
            }
        }
        return clonedObject
    }

    return obj
}
