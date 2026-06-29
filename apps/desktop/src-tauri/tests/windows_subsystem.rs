#[test]
fn windows_release_binary_uses_gui_subsystem() {
    let main_rs = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/main.rs"))
        .expect("src/main.rs should be readable");

    assert!(
        main_rs.contains("cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")"),
        "Windows release builds must use the GUI subsystem so launching the installed app does not open a console window"
    );
}
