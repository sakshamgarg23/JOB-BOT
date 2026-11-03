export const consultingCompanies=['Accenture','Deloitte','TCS','Tata Consultancy Services','Infosys','Wipro','Capgemini','Cognizant','HCLTech','Tech Mahindra','IBM','LTIMindtree','Mphasis','Persistent Systems','EPAM','Thoughtworks','Sopra Steria','Version 1','Devoteam','Publicis Sapient','EY','PwC','KPMG'];
export function companyPreference(company:string,names:string[]){
 const normalize=(v:string)=>v.toLowerCase().replace(/\b(?:in india|pvt|private|limited|ltd|incorporated|inc|llc|plc)\b/g,'').replace(/[^a-z0-9]/g,'');
 const value=normalize(company);
 const matchedName=value?names.find(name=>normalize(name)===value)||null:null;
 return {preferred:!!matchedName,matchedName,label:matchedName?'Preferred employer':'Other employer'};
}

