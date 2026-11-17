'use strict';
const fixture=()=>({schema_version:1,id:'fixture:1',creator_id:'fixture:creator',source_account:'https://old.example/author/1',status:'banned',status_evidence:[{url:'https://old.example/notice/1',kind:'provider_notice',observed_unix:90}],destination_account:'https://modholdmods.com/u/example',identity_evidence:[{url:'https://old.example/author/1',kind:'creator_crosslink',observed_unix:95}],project_mappings:[{source_project:'https://old.example/mod/1',destination_project:'https://modholdmods.com/g/skyrim-se/mods/12',game:'skyrim-se',evidence_url:'https://old.example/notice/1',verified:true}],observed_unix:100,review_after_unix:200,lifecycle:'active'});

module.exports={fixture};
