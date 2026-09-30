// ═════════════════════════════════════════════════════════════════
//  Remove specific DELTA TRADING HUB leads
//  Usage:
//    DRY RUN (just shows what would be deleted):
//      mongosh "<SERVER_URI>" remove-tradinghub-leads.js
//    REAL DELETE: set DELETE_FOR_REAL = true below, run again.
// ═════════════════════════════════════════════════════════════════

const DELETE_FOR_REAL = false;   // ← change to true only after checking the dry run

const PHONES = [
  "9779815278592","503183994","9978798989","563397223","97433576954",
  "9747864390","506514689","96892022298","971525195112","567934500",
  "971552955422","96877227256","525283452","562065402","971506387731",
  "1234567890","905336489117","509983944","529101373","169797333",
  "971509744175","504252403","506534538","505685233","9072873406",
  "97450218700","971555241232","971509878183","505275646","569014009",
  "971521863865","509980882","508571033","524663565","507645697",
  "97430745555","96596697104","505483615","502979102","581370732",
  "566552145","0","966535162177","971508378102","569049324",
  "971 050 290 156 7","918111961858","971585891287","971502350707",
  "971565323214","96560689451","542247823","557079269","564939691",
  "525094212","7846622991","8606030488","971504288396","9828345747",
  "506320424","9562363773","971554482549","562571324","507547324",
  "547265994","522551923","96878027370","523251390","966504389828",
  "509396279","505491499","566068075","503596382","971523731510",
];

const EMAILS = [
  "mdaraman9815@gmail.com","lovely_ygt59@yahoo.com","vishaldave385@gmail.com",
  "trike1984@yahoo.com","makhwat73@gmail.com","kpnisha009@gmail.com",
  "aditya.sanghi@risingsuntech.net","najamsur1970@gmail.com","gb8750470@gmail.com",
  "harivignesh6900@gmail.com","fochoprince@gmail.com","nawaszayan4@gmail.com",
  "navasziyuu@gmail.com","faisalstradingac@gmail.com","mujeebudn5402@gmail.com",
  "tajmehboob@yahoo.com","gulgulu@gulgulu.com","volkan@opofinance.com",
  "wilsonrahul129@gmail.com","mohdmustha010@gmail.com","erwinraj@gmail.com",
  "muhammadtageldeen@gmail.com","dhir581@outlook.com","cp.jimmy2014@outlook.com",
  "moothedan12@hotmail.com","meenu09102000@gmail.com","fawazqa917@gmail.com",
  "farshadfarshu5150@gmail.com","faiz401285@gmail.com","osamahemedandarge@gmail.com",
  "assadkalper5@gmail.com","ashokjashroon@gmail.com","munefk0@gmail.com",
  "vikram.jadhav1@gmail.com","forexfor15@gmail.com","dilipsakhi@gmail.com",
  "ajmalnrm@gmail.com","lancyantony21@gmail.com","khakbarali@yahoo.com",
  "cdhaneesh@gmail.com","traderdickmanpious@gmail.com","ms6696470@gmail.com",
  "fankhan466@gmail.com","rashidahmad054@gmail.com","jeevantg2020@gmail.com",
  "jagannz@gmail.com","tsk42024@gmail.com","unaissafkana1858@gmail.com",
  "h.naz@icloud.com","ameensabid7@gmail.com","mdfokrulislamsami05@gmaile.com",
  "mirshadalo0@gmail.com","nithinjithu28@gmail.com","shiju.shijugeorge@gnail.com",
  "mona141987@gmail.com","sathya.sakti@gmail.com","drzakiraufi@yahoo.com",
  "fawaz.n786@gmail.com","maneeshvkdmanu@gamil.com","prakashgurjar0484@gmail.com",
  "tct9402@gmail.com","muhammadufsir01@gmail.com","vineethnairbhm@gmail.com",
  "farhannizam386@gmail.com","drwaad73@yahoo.com","akhileshakhil197@gmail.com",
  "alusine.ae@gmail.com","calwinrodrigues820@gmail.com","trajnish8@gmail.com",
  "mohammadafsarmohammad09@gmail.com","mavous.asad31@gmail.com","rajon.ae2@gmail.com",
  "irfanamohamediqbal@gmail.com","marebixo143@gmail.com","sharmasunita.9800@gmail.com",
];

// ── Normalize: digits only, so "971 050 290 156 7" matches "9710502901567"
function normPhone(p) { return String(p || "").replace(/\D/g, ""); }

const phoneSet = new Set(PHONES.map(normPhone).filter(p => p !== ""));
const emailSet = new Set(EMAILS.map(e => e.toLowerCase().trim()));

// ── Only leads from this source are ever considered ──────────────
const candidates = db.leads.find({ source: "DELTA TRADING HUB" }).toArray();

const toDelete = candidates.filter(l => {
  const phoneMatch = phoneSet.has(normPhone(l.phone));
  const emailMatch = l.email && emailSet.has(String(l.email).toLowerCase().trim());
  return phoneMatch || emailMatch;
});

print("Source 'DELTA TRADING HUB' leads in DB : " + candidates.length);
print("Matched for deletion                    : " + toDelete.length);
print("─────────────────────────────────────────");
toDelete.forEach(l => print(`  ${l._id}  ${l.name}  ${l.phone}  ${l.email || "-"}`));
print("─────────────────────────────────────────");

if (DELETE_FOR_REAL) {
  const ids = toDelete.map(l => l._id);
  const res = db.leads.deleteMany({ _id: { $in: ids }, source: "DELTA TRADING HUB" });
  print("🗑  DELETED: " + res.deletedCount + " leads");
} else {
  print("DRY RUN — nothing deleted. Set DELETE_FOR_REAL = true and run again to delete.");
}
