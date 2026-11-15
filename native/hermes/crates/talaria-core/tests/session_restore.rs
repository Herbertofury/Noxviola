use talaria_core::BrowserController;

#[test]
fn one_hundred_tabs_restore_order_active_tab_and_empty_new_tabs() {
    let mut controller = BrowserController::default();
    for index in 0..100 {
        if index > 0 {
            controller.open_tab();
        }
        if index % 7 != 0 {
            controller
                .queue_navigation("https://example.com/repeated")
                .unwrap();
        }
    }
    assert!(controller.select_tab_at(37));
    let original = controller.session_snapshot();
    assert_eq!(original.tabs.len(), 100);
    assert!(original.tabs.iter().any(|tab| tab.url.is_empty()));
    let restored = BrowserController::from_session(original.clone()).unwrap();
    assert_eq!(restored.session_snapshot(), original);
    assert_eq!(
        restored
            .tabs()
            .position(|tab| tab.id() == restored.active_tab_id()),
        Some(37)
    );
}

#[test]
fn restores_metadata_and_new_tabs_get_distinct_ids() {
    let mut controller = BrowserController::default();
    controller.open_tab();
    let mut original = controller.session_snapshot();
    original.tabs[0].title = String::new();
    original.tabs[0].extra.insert("group".into(), "work".into());
    let mut restored = BrowserController::from_session(original.clone()).unwrap();
    assert_eq!(restored.session_snapshot(), original);
    restored.open_tab();
    let updated = restored.session_snapshot();
    assert_eq!(updated.tabs.len(), 3);
    assert_ne!(updated.tabs[2].id, updated.tabs[0].id);
    assert_ne!(updated.tabs[2].id, updated.tabs[1].id);
    assert!(updated.validate().is_ok());
}
