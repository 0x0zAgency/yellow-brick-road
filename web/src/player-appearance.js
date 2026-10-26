/** The Player shares the workspace's versioned theme format, but not its saved browser state. */
import {APPEARANCE_KEY,loadAppearance,saveAppearance,validateTheme} from './appearance.js';
export const PLAYER_APPEARANCE_KEY='ybr:player:appearance:v1';
export const PLAYER_ICON_FIELDS={player:'Library',bricks:'Brick inspector',settings:'Settings',placeholder:'Missing artwork'};
function isolatedStorage(storage){
 if(!storage)return null;
 return {getItem(key){if(key!==APPEARANCE_KEY)throw Error('Unsupported appearance key.');return storage.getItem(PLAYER_APPEARANCE_KEY);},
  setItem(key,value){if(key!==APPEARANCE_KEY)throw Error('Unsupported appearance key.');storage.setItem(PLAYER_APPEARANCE_KEY,value);}};
}
export const loadPlayerAppearance=storage=>loadAppearance(isolatedStorage(storage));
export const savePlayerAppearance=(storage,value)=>saveAppearance(isolatedStorage(storage),value);
export function playerThemeVariables(theme){
 const t=validateTheme(theme),vars={};
 for(const [key,value] of Object.entries(t.colors))vars['--road-'+key]=value;
 vars['--road-background-image']=t.graphics.background?'url("'+t.graphics.background+'")':'none';
 vars['--road-background-opacity']=String(t.backgroundOpacity);
 return vars;
}
/** Explicit links inherit HTTPS. No RPC endpoints or credentials come from themes. */
export function workspaceUrl(protocol='http:'){
 if(!['http:','https:'].includes(protocol))throw Error('Unsupported workspace protocol.');
 return protocol+'//127.0.0.1:5173/';
}
