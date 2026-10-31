import {documentFor,validateDocument} from './document.js';
const API='https://www.googleapis.com/drive/v3/files';
export class ConflictError extends Error{constructor(){super('Google diskā ir jaunāki dati. Lejupielādējiet nesaglabātās izmaiņas un pārlādējiet datus.');}}
export class DriveStore{
  constructor(account){this.account=account;this.fileId=null;this.version=null;}
  metadata(){return this.account.request(`${API}/${encodeURIComponent(this.fileId)}?fields=id,version`);}
  async read(){
    const before=await this.metadata();
    const doc=validateDocument(await this.account.request(`${API}/${this.fileId}?alt=media`));
    const after=await this.metadata();if(before.version!==after.version)throw new ConflictError();
    this.version=after.version;return doc;
  }
  async load(){
    let files=[],pageToken;
    do{
      const params=new URLSearchParams({spaces:'appDataFolder',q:"name = 'planner.json' and trashed = false",fields:'nextPageToken,files(id,name)',pageSize:'1000'});
      if(pageToken)params.set('pageToken',pageToken);
      const page=await this.account.request(`${API}?${params}`);files.push(...(page.files||[]));pageToken=page.nextPageToken;
    }while(pageToken);
    if(files.length>1)throw new Error('Google diskā ir vairāki planner.json faili. Pirms turpināšanas jānovērš datu dublēšanās.');
    if(!files.length){
      const ids=await this.account.request(`${API}/generateIds?count=1&space=appDataFolder&type=files`);
      this.fileId=ids.ids[0];const doc=documentFor([]);
      // Reconcile a lost create response using the pre-generated ID; never create a second file.
      try{await this.create(doc);}catch(error){try{await this.metadata();}catch{throw error;}}
    }else this.fileId=files[0].id;
    return this.read();
  }
  async create(doc){
    const boundary=`planner_${crypto.randomUUID()}`;
    const metadata={id:this.fileId,name:'planner.json',mimeType:'application/json',parents:['appDataFolder']};
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(doc)}\r\n--${boundary}--`;
    await this.account.request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  }
  async save(doc,expectedVersion){
    validateDocument(doc);
    const current=await this.metadata();
    if(current.version!==expectedVersion){
      const remote=await this.read();
      if(remote.writeId===doc.writeId)return remote; // A prior upload succeeded but its response was lost.
      throw new ConflictError();
    }
    await this.account.request(`https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media&fields=id,version`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
    const saved=await this.read();if(saved.writeId!==doc.writeId)throw new ConflictError();return saved;
  }
}
