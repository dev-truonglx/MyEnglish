/**
 * Very common English words (function words and everyday A1–A2 vocabulary, including basic computer
 * words). The reading mode treats them as known, so only less common words are suggested as new.
 * Base forms only: inflections (-s, -ed, -ing...) are recognised by the reader.
 */
const WORDS = `
a about above across act action actually add after again against age ago agree all allow almost alone along already also
although always am among an and another answer any anyone anything anyway app appear apply are area around art as ask at
available away back bad base be because become been before begin behind being believe below best better between big bit
black block blue body book both bottom box break bring brown bug build business busy but button buy by call can car card
care carry case cause center certain chance change check child choose city class clean clear click close code cold color
come common company complete computer content continue control copy correct cost could country course create current cut
data date day dead deal dear decide deep delete describe design detail develop did die different difficult do document
does doing done door down draw drive drop during each early easy eat edit either else email empty end enough enter error
even evening event ever every everyone everything example except expect explain eye face fact fail fall false family far
fast feature feel few field file fill final find fine finish first fix flow follow food for form forward free friend from
front full fun function future game general get give glad go good got great green group grow guess had half hand happen
happy hard has have he head hear help her here high him his history hold home hope hot hour house how however i idea if
image important in include info information input inside instead interest internet into is issue it item its job join
just keep key kind know language large last late later learn least leave left less let letter level life light like line
link list listen little live load local long look lose lot love low main make man manage many may maybe me mean meet
member menu message method might mind minute miss mode model moment money month more morning most move much must my name
need network never new next nice night no none normal not note nothing now number of off offer office often ok okay old
on once one online only open option or order other our out output over own page part pass password past pay people per
person phone pick place plan play please point possible post power press pretty price print problem process product
program project provide public pull push put question quick quickly quite rather read ready real really reason receive
red remember remove reply report request result return right room rule run safe same save say screen search second see
seem select send sense server service set setting several share she short should show side sign simple since site size
small so software some someone something sometimes soon sorry sound source space speak special speed start state step
still stop store story string sure system table take talk task team tell term test text than thank that the their them
then there these they thing think this those though thought through time tip title to today together too tool top total
true try turn type under understand until up update upon us use used user usually value very version view wait want was
watch water way we web website week well were what when where whether which while white who whole why will window with
within without word work world would write wrong year yes yet you your
able account afternoon air apple baby bag bank bed beautiful board boat bread brother building cat chair cheap children
choice clock coffee cook cool corner cup dark daughter desk dinner doctor dog dollar dream dress drink ear earth east egg
eight eleven english enjoy exactly father favorite fifteen fifty film fire fish five floor fly foot forget four garden
girl glass gold hair hat health heart heavy hello hi holiday horse hospital hotel hundred husband ice ill kid king kitchen
lady lake land laugh lesson lie lunch machine map market married matter meal meat middle milk million mine mom mother
mountain mouth movie music near neck news newspaper nine nose ocean paper parent park party pen pencil picture piece pink
plane plant plate player pocket police poor quiet rain reach rich ride river road rock roof round sad salt sea season
seat seven shirt shoe shop sick sing sister sit six sky sleep slow smile snow son song south station stay street student
study sugar summer sun teacher telephone ten three ticket tired tomorrow tonight town toy train travel tree trip twelve
twenty two uncle university village visit voice walk wall warm wash weather weekend west wife win wind winter woman wood
yellow yesterday young zero monday tuesday wednesday thursday friday saturday sunday january february march april june
july august september october november december
database browser download upload login logout username keyboard mouse laptop desktop folder
took taken went gone came made said got gotten gave given knew known saw seen told found felt kept began begun brought
bought built ran wrote written sent spent stood understood chose chosen broke broken drove driven fell fallen forgot
forgotten grew grown held heard hid lost meant met paid rose sold shown sat slept spoke spoken taught threw thrown won
wore woke ate eaten drank flew flown hung led lent shut sang swam
`;

export const COMMON_WORDS: ReadonlySet<string> = new Set(WORDS.split(/\s+/).filter(Boolean));

/**
 * Function words only (articles, pronouns, auxiliaries, prepositions, conjunctions, question words):
 * what an absolute beginner can be assumed to recognise. In foundation mode the reader treats only
 * these as known, so everyday words (because, need, change…) are still offered as words to learn.
 */
const FUNCTION = `
a an the this that these those i me my mine you your yours he him his she her hers it its we us our ours
they them their theirs myself yourself be am is are was were been being do does did done have has had
having will would shall should can could may might must not no yes and or but so if than as of to in on
at by for with from into up down out off over under there here what which who whom whose why how where
when let's ok okay
`;

export const FUNCTION_WORDS: ReadonlySet<string> = new Set(FUNCTION.split(/\s+/).filter(Boolean));
