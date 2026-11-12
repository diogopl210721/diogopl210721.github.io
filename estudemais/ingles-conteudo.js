/* EstudeUp — Aprenda Inglês: conteúdo das lições (original do EstudeUp).
   Cada lição tem palavras [inglês, português, emoji] e frases [inglês, português].
   Respostas alternativas aceitas vêm separadas por "|" (a primeira é a que aparece). */

const INGLES = [
  {
    id: 'u1', titulo: 'Primeiros passos', cor: '#2F5BEA',
    licoes: [
      {
        id: 'u1l1', titulo: 'Cumprimentos', emoji: '👋',
        palavras: [['hello', 'olá', '👋'], ['good morning', 'bom dia', '🌅'], ['good night', 'boa noite', '🌙'], ['bye', 'tchau', '🚪'],
          ['thank you', 'obrigado|obrigada', '🙏'], ['please', 'por favor', '🤲'], ['yes', 'sim', '👍'], ['no', 'não', '👎']],
        frases: [['Hello, good morning!', 'Olá, bom dia!'], ['Thank you very much.', 'Muito obrigado.|Muito obrigada.'],
          ['Good night, bye!', 'Boa noite, tchau!'], ['Yes, please.', 'Sim, por favor.'], ['No, thank you.', 'Não, obrigado.|Não, obrigada.']],
      },
      {
        id: 'u1l2', titulo: 'Se apresentando', emoji: '🙋',
        palavras: [['name', 'nome', '🏷️'], ['I', 'eu', '🙋'], ['you', 'você', '👉'], ['friend', 'amigo|amiga', '🤝'],
          ['student', 'estudante|aluno|aluna', '🎒'], ['teacher', 'professor|professora', '👩‍🏫'], ['fine', 'bem', '😊'], ['and', 'e', '➕']],
        frases: [['My name is Ana.', 'Meu nome é Ana.'], ['I am a student.|I\'m a student.', 'Eu sou um estudante.|Eu sou estudante.|Sou estudante.'],
          ['How are you?', 'Como você está?|Como vai você?|Tudo bem?'], ['I am fine, thank you.|I\'m fine, thank you.', 'Eu estou bem, obrigado.|Estou bem, obrigado.|Estou bem, obrigada.'],
          ['Nice to meet you.', 'Prazer em conhecer você.|Prazer em te conhecer.|Prazer em conhecê-lo.'], ['She is my friend.|She\'s my friend.', 'Ela é minha amiga.']],
      },
      {
        id: 'u1l3', titulo: 'Números', emoji: '🔢',
        palavras: [['one', 'um|uma', '1️⃣'], ['two', 'dois|duas', '2️⃣'], ['three', 'três', '3️⃣'], ['four', 'quatro', '4️⃣'],
          ['five', 'cinco', '5️⃣'], ['six', 'seis', '6️⃣'], ['seven', 'sete', '7️⃣'], ['eight', 'oito', '8️⃣'], ['nine', 'nove', '9️⃣'], ['ten', 'dez', '🔟']],
        frases: [['I have two books.|I\'ve got two books.', 'Eu tenho dois livros.|Tenho dois livros.'], ['She is ten years old.|She\'s ten years old.', 'Ela tem dez anos.'],
          ['Three friends and one teacher.', 'Três amigos e um professor.'], ['I am fifteen.|I\'m fifteen.', 'Eu tenho quinze anos.|Tenho quinze anos.']],
      },
      {
        id: 'u1l4', titulo: 'Cores', emoji: '🎨',
        palavras: [['red', 'vermelho|vermelha', '🔴'], ['blue', 'azul', '🔵'], ['green', 'verde', '🟢'], ['yellow', 'amarelo|amarela', '🟡'],
          ['black', 'preto|preta', '⚫'], ['white', 'branco|branca', '⚪'], ['orange', 'laranja', '🟠'], ['purple', 'roxo|roxa', '🟣']],
        frases: [['The sky is blue.', 'O céu é azul.'], ['My bag is black.', 'Minha mochila é preta.|Minha bolsa é preta.'],
          ['I like green.', 'Eu gosto de verde.|Gosto de verde.'], ['The car is red and white.', 'O carro é vermelho e branco.']],
      },
    ],
  },
  {
    id: 'u2', titulo: 'Na escola', cor: '#7B3FE4',
    licoes: [
      {
        id: 'u2l1', titulo: 'Material escolar', emoji: '🎒',
        palavras: [['book', 'livro', '📕'], ['pen', 'caneta', '🖊️'], ['pencil', 'lápis', '✏️'], ['notebook', 'caderno', '📓'],
          ['backpack', 'mochila', '🎒'], ['eraser', 'borracha', '🧽'], ['ruler', 'régua', '📏'], ['desk', 'carteira|mesa', '🪑']],
        frases: [['This is my pencil.', 'Este é meu lápis.|Esse é meu lápis.'], ['Where is my notebook?', 'Onde está meu caderno?|Cadê meu caderno?'],
          ['The book is on the desk.', 'O livro está na carteira.|O livro está na mesa.'], ['Can I use your eraser?', 'Posso usar sua borracha?']],
      },
      {
        id: 'u2l2', titulo: 'Matérias', emoji: '📚',
        palavras: [['math', 'matemática', '➗'], ['science', 'ciências', '🔬'], ['history', 'história', '🏛️'], ['geography', 'geografia', '🗺️'],
          ['English', 'inglês', '🇬🇧'], ['art', 'arte|artes', '🎨'], ['class', 'aula|turma', '🏫'], ['test', 'prova|teste', '📝']],
        frases: [['I like math.', 'Eu gosto de matemática.|Gosto de matemática.'], ['We have a test today.', 'Nós temos uma prova hoje.|Temos uma prova hoje.|Temos prova hoje.'],
          ['History class is fun.', 'A aula de história é divertida.'], ['My favorite subject is science.', 'Minha matéria favorita é ciências.']],
      },
      {
        id: 'u2l3', titulo: 'Ações na aula', emoji: '✍️',
        palavras: [['read', 'ler', '📖'], ['write', 'escrever', '✍️'], ['listen', 'ouvir|escutar', '👂'], ['speak', 'falar', '🗣️'],
          ['study', 'estudar', '📚'], ['learn', 'aprender', '🧠'], ['open', 'abrir', '📂'], ['close', 'fechar', '📁']],
        frases: [['Open your book, please.', 'Abra seu livro, por favor.|Abram seus livros, por favor.'], ['Listen to the teacher.', 'Ouça o professor.|Escute o professor.|Ouçam o professor.'],
          ['I study every day.', 'Eu estudo todos os dias.|Estudo todo dia.|Eu estudo todo dia.'], ['We learn English at school.', 'Nós aprendemos inglês na escola.|Aprendemos inglês na escola.']],
      },
      {
        id: 'u2l4', titulo: 'Dias da semana', emoji: '📅',
        palavras: [['Monday', 'segunda-feira|segunda', '1️⃣'], ['Tuesday', 'terça-feira|terça', '2️⃣'], ['Wednesday', 'quarta-feira|quarta', '3️⃣'],
          ['Thursday', 'quinta-feira|quinta', '4️⃣'], ['Friday', 'sexta-feira|sexta', '5️⃣'], ['Saturday', 'sábado', '6️⃣'], ['Sunday', 'domingo', '7️⃣'], ['today', 'hoje', '📅']],
        frases: [['Today is Monday.', 'Hoje é segunda-feira.|Hoje é segunda.'], ['I have English on Friday.', 'Eu tenho inglês na sexta-feira.|Tenho inglês na sexta.|Tenho inglês na sexta-feira.'],
          ['Saturday and Sunday are the weekend.', 'Sábado e domingo são o fim de semana.'], ['The test is on Wednesday.', 'A prova é na quarta-feira.|A prova é na quarta.']],
      },
    ],
  },
  {
    id: 'u3', titulo: 'Minha rotina', cor: '#C2389E',
    licoes: [
      {
        id: 'u3l1', titulo: 'Família', emoji: '👨‍👩‍👧',
        palavras: [['mother', 'mãe', '👩'], ['father', 'pai', '👨'], ['sister', 'irmã', '👧'], ['brother', 'irmão', '👦'],
          ['grandmother', 'avó', '👵'], ['grandfather', 'avô', '👴'], ['family', 'família', '👨‍👩‍👧'], ['home', 'casa|lar', '🏠']],
        frases: [['This is my mother.', 'Esta é minha mãe.|Essa é minha mãe.'], ['I have one brother.', 'Eu tenho um irmão.|Tenho um irmão.'],
          ['My family is big.', 'Minha família é grande.'], ['My grandmother lives with us.', 'Minha avó mora com a gente.|Minha avó mora conosco.']],
      },
      {
        id: 'u3l2', titulo: 'Comida', emoji: '🍎',
        palavras: [['water', 'água', '💧'], ['bread', 'pão', '🍞'], ['rice', 'arroz', '🍚'], ['beans', 'feijão', '🫘'],
          ['apple', 'maçã', '🍎'], ['milk', 'leite', '🥛'], ['chicken', 'frango', '🍗'], ['juice', 'suco', '🧃']],
        frases: [['I eat rice and beans.', 'Eu como arroz e feijão.|Como arroz e feijão.'], ['Can I have some water, please?', 'Posso tomar um pouco de água, por favor?|Pode me dar água, por favor?'],
          ['She drinks orange juice.', 'Ela bebe suco de laranja.|Ela toma suco de laranja.'], ['I don\'t like milk.|I do not like milk.', 'Eu não gosto de leite.|Não gosto de leite.']],
      },
      {
        id: 'u3l3', titulo: 'Meu dia', emoji: '⏰',
        palavras: [['wake up', 'acordar', '⏰'], ['have breakfast', 'tomar café da manhã', '🥐'], ['go to school', 'ir para a escola|ir à escola', '🚌'],
          ['have lunch', 'almoçar', '🍽️'], ['go home', 'ir para casa', '🏠'], ['sleep', 'dormir', '😴'], ['morning', 'manhã', '🌅'], ['night', 'noite', '🌙']],
        frases: [['I wake up at seven.', 'Eu acordo às sete.|Acordo às sete.'], ['I go to school by bus.', 'Eu vou para a escola de ônibus.|Vou para a escola de ônibus.|Vou à escola de ônibus.'],
          ['We have lunch at noon.', 'Nós almoçamos ao meio-dia.|Almoçamos ao meio-dia.'], ['I sleep at night.', 'Eu durmo à noite.|Durmo à noite.']],
      },
      {
        id: 'u3l4', titulo: 'Gostos', emoji: '❤️',
        palavras: [['like', 'gostar', '👍'], ['love', 'amar|adorar', '❤️'], ['music', 'música', '🎵'], ['soccer', 'futebol', '⚽'],
          ['movies', 'filmes', '🎬'], ['games', 'jogos', '🎮'], ['dance', 'dançar', '💃'], ['play', 'jogar|brincar|tocar', '🕹️']],
        frases: [['I love music.', 'Eu amo música.|Eu adoro música.|Amo música.|Adoro música.'], ['Do you like soccer?', 'Você gosta de futebol?'],
          ['I play games on Saturday.', 'Eu jogo no sábado.|Jogo no sábado.|Eu jogo jogos no sábado.'], ['She doesn\'t like movies.|She does not like movies.', 'Ela não gosta de filmes.']],
      },
    ],
  },
];
