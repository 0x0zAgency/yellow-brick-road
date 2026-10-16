import {useEffect,useState} from 'react';
import {formatAddress,resolvePrimaryEns} from './ens.js';
export function useEnsIdentity(address){
 const [record,setRecord]=useState({address:null,name:null,loading:false});
 useEffect(()=>{
  let active=true;
  if(!address){setRecord({address:null,name:null,loading:false});return;}
  setRecord({address,name:null,loading:true});
  resolvePrimaryEns(address).then(name=>{if(active)setRecord({address,name,loading:false})})
    .catch(()=>{if(active)setRecord({address,name:null,loading:false})});
  return()=>{active=false};
 },[address]);
 const valid=record.address===address;
 return {ensName:valid?record.name:null,loading:valid&&record.loading,displayName:(valid&&record.name)||formatAddress(address)};
}