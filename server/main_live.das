
require daslib/live
require fio

[export]
def main()
    let app_f = "main.das"
    let app_d = "."
    go_live(app_f, app_d)
    if !is_app_live()
        panic("go_live failed")

    while true
        invoke_live("act")
        if watch_files()
            print("files updated - recompile\n")
            recompile()
        sleep(10u)
