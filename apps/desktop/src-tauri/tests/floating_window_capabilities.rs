use serde_json::Value;

#[test]
fn floating_windows_can_restore_cached_geometry() {
    let capability_json = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/capabilities/default.json"
    ))
    .expect("default capability should be readable");
    let capability: Value =
        serde_json::from_str(&capability_json).expect("default capability should be valid JSON");

    let windows = capability["windows"]
        .as_array()
        .expect("default capability should list window labels");
    for expected_window in ["floating-card", "memo-card-*"] {
        assert!(
            windows
                .iter()
                .any(|window| window.as_str() == Some(expected_window)),
            "default capability must apply to {expected_window}"
        );
    }

    let permissions = capability["permissions"]
        .as_array()
        .expect("default capability should list permissions");
    for expected_permission in [
        "core:window:allow-inner-size",
        "core:window:allow-outer-position",
        "core:window:allow-set-position",
        "core:window:allow-set-size",
    ] {
        assert!(
            permissions
                .iter()
                .any(|permission| permission.as_str() == Some(expected_permission)),
            "floating windows must be allowed to call {expected_permission}"
        );
    }
}
