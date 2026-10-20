import {expect,it} from 'vitest';
import {useAmbientConversation} from './ambientConversationStore';
import type {AmbientConversation} from '../game/bridge';
const record:AmbientConversation={id:'one',participants:[{id:'a',name:'Role A'},{id:'b',name:'Role B'}],turns:[{speakerId:'a',text:'Bir fikrin var mı?'}],active:true};
it('closed popups stay closed during later replies and reopen only on an explicit click',()=>{
 const s=useAmbientConversation.getState();s.close();s.receive(record);expect(useAmbientConversation.getState().conversation).toBeNull();
 s.receive(record,true);s.receive({...record,turns:[...record.turns,{speakerId:'b',text:'Birlikte bakalım.'}]});expect(useAmbientConversation.getState().conversation?.turns).toHaveLength(2);
 s.close();s.receive(record);expect(useAmbientConversation.getState().conversation).toBeNull();s.receive(record,true);expect(useAmbientConversation.getState().conversation?.id).toBe('one');
 s.receive(null);expect(useAmbientConversation.getState().conversation).toBeNull();
});
