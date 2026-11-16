'use strict';

// One checking preference controls every application-owned Session. Electron
// performs the spelling work locally, but its Session constructor can fetch
// Hunspell files independently of this preference. This is not download consent
// or a network fence. No dictionary mirror, polling or reporting is added.
class SpellcheckService {
  constructor({enabled=true,canAct=()=>true,onError=()=>{}}={}) {
    if(typeof enabled!=='boolean')throw new TypeError('Spellcheck must be explicitly enabled or disabled.');
    this.enabled=enabled;this.canAct=canAct;this.onError=onError;this.sessions=new Set();this.inconsistent=false;
  }
  attach(target) {
    if(this.sessions.has(target))return;
    target.setSpellCheckerEnabled(this.enabled);
    this.sessions.add(target);
  }
  setEnabled(enabled) {
    if(typeof enabled!=='boolean')throw new TypeError('Spellcheck must be explicitly enabled or disabled.');
    if(enabled===this.enabled&&!this.inconsistent)return;
    const changed=[];
    try {
      for(const target of this.sessions){changed.push(target);target.setSpellCheckerEnabled(enabled);}
    } catch(error) {
      this.inconsistent=true;
      const failures=[];
      for(const target of changed)try{target.setSpellCheckerEnabled(this.enabled);}catch(rollback){failures.push(rollback.message);}
      if(failures.length)throw new Error(`Spellcheck could not be changed consistently: ${error.message}. Previous setting could not be restored for ${failures.length} session(s): ${failures.join('; ')}`);
      throw error;
    }
    this.enabled=enabled;this.inconsistent=false;
  }
  contextMenu(contents,params) {
    if(!this.enabled||!params.isEditable||!params.misspelledWord||!Array.isArray(params.dictionarySuggestions))return [];
    const suggestions=params.dictionarySuggestions.filter(value=>typeof value==='string'&&value.length);
    if(!suggestions.length)return [{label:'No spelling suggestions',enabled:false},{type:'separator'}];
    return [...suggestions.map(suggestion=>({label:suggestion,click:()=>{
      if(!this.enabled||!this.canAct()||contents.isDestroyed())return;
      try{contents.replaceMisspelling(suggestion);}catch(error){this.onError(`Spelling correction could not be applied: ${error.message}`);}
    }})),{type:'separator'}];
  }
}

module.exports={SpellcheckService};
