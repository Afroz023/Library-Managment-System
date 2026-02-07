// server.js
var mongoClient = require("mongodb").MongoClient;
var express = require("express");
var cors = require("cors");

var connectionstring = "mongodb://127.0.0.1:27017/";
var app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + Number(days));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

app.get("/", (req, res) => {
  res.send("<h2>WELCOME TO LIBRARY MANAGEMENT PROJECT</h2>");
});

// ====================== ADMIN ======================
app.get("/getadmin", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");
    dbo.collection("Admin").find().toArray((err, document) => {
      clientObj.close();
      if (err) return res.status(500).send("Failed to fetch admin");
      res.send(document);
    });
  });
});

// ====================== BOOKS ======================
app.get("/getbooks", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");
    dbo.collection("tblBooks").find().toArray((err, document) => {
      clientObj.close();
      if (err) return res.status(500).send("Failed to fetch books");
      res.send(document);
    });
  });
});

app.post("/addbook", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = clientObj.db("LibraryDB");
    const book = {
      id: Number(req.body.id),
      title: req.body.title,
      author: req.body.author,
      category: req.body.category,
      quantity: Number(req.body.quantity),
      status: req.body.status
    };

    dbo.collection("tblBooks").findOne({ id: book.id }, (err, existingBook) => {
      if (err) {
        clientObj.close();
        return res.status(500).send("Error checking existing book");
      }

      if (existingBook) {
        clientObj.close();
        return res.status(400).send("Book with this ID already exists ❌");
      }

      dbo.collection("tblBooks").insertOne(book, (err) => {
        clientObj.close();
        if (err) return res.status(500).send("Error while adding book");
        res.send("Book Added Successfully ✅");
      });
    });
  });
});

app.delete("/deletebook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, clientObj) => {
    if (err) return res.status(500).send("DB connection failed");
    var dbo = clientObj.db("LibraryDB");

    dbo.collection("tblBooks").deleteOne({ id: Number(req.params.id) }, (err, result) => {
      clientObj.close();
      if (err) return res.status(500).send("Error deleting book");
      if (result.deletedCount === 0) return res.send("Book not found");
      res.send("Book Deleted Successfully");
    });
  });
});

app.put("/updatebook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");
    dbo.collection("tblBooks").updateOne(
      { id: Number(req.params.id) },
      {
        $set: {
          title: req.body.title,
          author: req.body.author,
          category: req.body.category,
          quantity: Number(req.body.quantity),
          status: req.body.status
        }
      },
      (err, result) => {
        client.close();
        if (err) return res.status(500).send("Update failed");
        if (result.matchedCount === 0) return res.status(404).send("Book not found");
        res.send("Book updated successfully");
      }
    );
  });
});

// ✅ Book lookup (for autofill)
app.get("/getbook/:id", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ❌");
    const dbo = client.db("LibraryDB");

    const idStr = String(req.params.id).trim();
    const idNum = Number(idStr);

    dbo.collection("tblBooks").findOne(
      { $or: [{ id: idNum }, { id: idStr }] },
      (err, book) => {
        client.close();
        if (err) return res.status(500).send("Failed to fetch book ❌");
        if (!book) return res.status(404).send("Book not found ❌");
        res.send(book);
      }
    );
  });
});

// ====================== STUDENTS ======================
app.post("/addstudent", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");

    const student = {
      rollNo: Number(req.body.rollNo),
      name: String(req.body.name || "").trim().toUpperCase(),
      email: String(req.body.email || "").trim(),
      mobile: String(req.body.mobile || "").trim(),
      course: String(req.body.course || "").trim()
    };

    if (!student.rollNo || !student.name || !student.email || !student.mobile || !student.course) {
      client.close();
      return res.status(400).send("All fields are required ❌");
    }

    dbo.collection("Students").findOne(
      { rollNo: student.rollNo, course: student.course },
      (err, existingStudent) => {
        if (err) {
          client.close();
          return res.status(500).send("Error checking existing student");
        }

        if (existingStudent) {
          client.close();
          return res.status(400).send("Student with this Roll No and Course already exists ❌");
        }

        dbo.collection("Students").insertOne(student, (err) => {
          client.close();
          if (err) return res.status(500).send("Failed to add student");
          res.send("Student added successfully ✅");
        });
      }
    );
  });
});

app.get("/getstudents", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");
    dbo.collection("Students").find().toArray((err, students) => {
      client.close();
      if (err) return res.status(500).send("Failed to fetch students");
      res.send(students);
    });
  });
});

app.delete("/deletestudent/:rollNo/:course", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed");

    const dbo = client.db("LibraryDB");
    dbo.collection("Students").deleteOne(
      { rollNo: Number(req.params.rollNo), course: String(req.params.course) },
      (err, result) => {
        client.close();
        if (err) return res.status(500).send("Failed to delete student");
        if (result.deletedCount === 0) return res.status(404).send("Student not found ❌");
        res.send("Student deleted successfully ✅");
      }
    );
  });
});

app.put("/updatestudent/:rollNo/:course", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ❌");

    const dbo = client.db("LibraryDB");

    const oldRollNo = Number(req.params.rollNo);
    const oldCourse = String(req.params.course);

    const updated = {
      rollNo: Number(req.body.rollNo),
      name: String(req.body.name || "").trim().toUpperCase(),
      email: String(req.body.email || "").trim(),
      mobile: String(req.body.mobile || "").trim(),
      course: String(req.body.course || "").trim()
    };

    if (!updated.rollNo || !updated.name || !updated.email || !updated.mobile || !updated.course) {
      client.close();
      return res.status(400).send("All fields are required ❌");
    }

    const changingKey = (updated.rollNo !== oldRollNo) || (updated.course !== oldCourse);

    const proceedUpdate = () => {
      dbo.collection("Students").updateOne(
        { rollNo: oldRollNo, course: oldCourse },
        {
          $set: {
            rollNo: updated.rollNo,
            course: updated.course,
            name: updated.name,
            email: updated.email,
            mobile: updated.mobile
          }
        },
        (err, result) => {
          client.close();
          if (err) return res.status(500).send("Update failed ❌");
          if (result.matchedCount === 0) return res.status(404).send("Student not found ❌");
          res.send("Student updated successfully ✅");
        }
      );
    };

    if (!changingKey) return proceedUpdate();

    dbo.collection("Students").findOne(
      { rollNo: updated.rollNo, course: updated.course },
      (err, exists) => {
        if (err) {
          client.close();
          return res.status(500).send("Error checking existing student");
        }

        if (exists && !(exists.rollNo === oldRollNo && exists.course === oldCourse)) {
          client.close();
          return res.status(400).send("Another student with this Roll No and Course already exists ❌");
        }

        proceedUpdate();
      }
    );
  });
});

// ✅ Student lookup (for autofill + view modal)
app.get("/getstudent/:rollNo", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ❌");
    const dbo = client.db("LibraryDB");

    const rollStr = String(req.params.rollNo).trim();
    const rollNum = Number(rollStr);

    dbo.collection("Students").findOne(
      { $or: [{ rollNo: rollNum }, { rollNo: rollStr }] },
      (err, student) => {
        client.close();
        if (err) return res.status(500).send("Failed to fetch student ❌");
        if (!student) return res.status(404).send("Student not found ❌");
        res.send(student);
      }
    );
  });
});

// ====================== ISSUE BOOKS ======================
// ✅ SINGLE BOOK (frontend compatibility: /issuebook)
app.post("/issuebook", (req, res) => {
  const rollNo = Number(req.body.rollNo);
  const bookId = Number(req.body.bookId);
  const issueDate = String(req.body.issueDate || "").trim() || new Date().toISOString().slice(0, 10);

  const loanDays = Number(req.body.loanDays) || 7;
  const dueDate = String(req.body.dueDate || "").trim() || addDaysISO(issueDate, loanDays);

  // reuse /issuebooks logic by calling it internally-style (same behavior)
  req.body = {
    rollNo,
    bookIds: [bookId],
    issueDate,
    loanDays,
    dueDate
  };
  return issueBooksHandler(req, res);
});

// ✅ MULTI BOOKS (existing route: /issuebooks)
app.post("/issuebooks", (req, res) => {
  return issueBooksHandler(req, res);
});

function issueBooksHandler(req, res) {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ❌");

    const dbo = client.db("LibraryDB");

    const rollNo = Number(req.body.rollNo);
    const bookIds = Array.isArray(req.body.bookIds) ? req.body.bookIds.map(Number) : [];
    const issueDate = String(req.body.issueDate || "").trim() || new Date().toISOString().slice(0, 10);

    const loanDays = Number(req.body.loanDays) || 7;
    const dueDate = String(req.body.dueDate || "").trim() || addDaysISO(issueDate, loanDays);

    if (!rollNo || !bookIds.length) {
      client.close();
      return res.status(400).send("rollNo and bookIds required ❌");
    }

    if (bookIds.length > 3) {
      client.close();
      return res.status(400).send("Maximum 3 books allowed ❌");
    }

    const uniq = new Set(bookIds);
    if (uniq.size !== bookIds.length) {
      client.close();
      return res.status(400).send("Duplicate Book IDs in request ❌");
    }

    // 1) Fetch student
    dbo.collection("Students").findOne({ rollNo }, (err, student) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch student ❌"); }
      if (!student) { client.close(); return res.status(404).send("Student not found ❌"); }

      const issuedBooks = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
      const alreadyIssuedCount = issuedBooks.length;

      if (alreadyIssuedCount + bookIds.length > 3) {
        client.close();
        return res.status(400).send(`Student can issue max 3 books. Already issued: ${alreadyIssuedCount} ❌`);
      }

      const alreadySet = new Set(issuedBooks.map(b => Number(b.bookId)));
      for (const id of bookIds) {
        if (alreadySet.has(id)) {
          client.close();
          return res.status(400).send(`Book ${id} already issued to this student ❌`);
        }
      }

      // 2) Fetch all books
      dbo.collection("tblBooks").find({ id: { $in: bookIds } }).toArray((err, books) => {
        if (err) { client.close(); return res.status(500).send("Failed to fetch books ❌"); }

        if (!books || books.length !== bookIds.length) {
          client.close();
          return res.status(404).send("One or more books not found ❌");
        }

        for (const b of books) {
          if (Number(b.quantity) <= 0) {
            client.close();
            return res.status(400).send(`Book ${b.id} not available (0 qty) ❌`);
          }
        }

        const decremented = [];
        const issuedRecords = [];
        const bookMap = new Map(books.map(b => [Number(b.id), b]));

        const updateNextBook = (i) => {
          if (i >= bookIds.length) {
            dbo.collection("Students").updateOne(
              { rollNo },
              { $push: { issuedBooks: { $each: issuedRecords } } },
              (err, stuUpd) => {
                if (err || !stuUpd || stuUpd.matchedCount === 0) {
                  rollbackBooks(() => {
                    client.close();
                    return res.status(500).send("Failed to update student ❌");
                  });
                  return;
                }

                client.close();
                res.send("Books issued successfully ✅");
              }
            );
            return;
          }

          const id = bookIds[i];
          const bk = bookMap.get(id);

          dbo.collection("tblBooks").findOneAndUpdate(
            { id: id, quantity: { $gt: 0 } },
            { $inc: { quantity: -1 } },
            { returnDocument: "after" },
            (err, result) => {
              if (err || !result || !result.value) {
                rollbackBooks(() => {
                  client.close();
                  res.status(400).send(`Book ${id} not available ❌`);
                });
                return;
              }

              decremented.push(id);

              const newQty = Number(result.value.quantity);
              const newStatus = newQty > 0 ? "Available" : "Issued";
              dbo.collection("tblBooks").updateOne({ id }, { $set: { status: newStatus } }, () => {});

              issuedRecords.push({
                bookId: id,
                bookName: bk.title,
                issueDate,
                loanDays,
                dueDate
              });

              updateNextBook(i + 1);
            }
          );
        };

        function rollbackBooks(done) {
          if (decremented.length === 0) return done();
          let left = decremented.length;

          decremented.forEach((id) => {
            dbo.collection("tblBooks").updateOne(
              { id },
              { $inc: { quantity: 1 }, $set: { status: "Available" } },
              () => {
                left--;
                if (left === 0) done();
              }
            );
          });
        }

        updateNextBook(0);
      });
    });
  });
}

//return book
app.post("/returnbook", (req, res) => {
  mongoClient.connect(connectionstring, { useUnifiedTopology: true }, (err, client) => {
    if (err) return res.status(500).send("DB connection failed ❌");

    const dbo = client.db("LibraryDB");
    const rollNo = Number(req.body.rollNo);
    const bookId = Number(req.body.bookId);

    if (!rollNo || !bookId) {
      client.close();
      return res.status(400).send("rollNo and bookId required ❌");
    }

    // 1) Make sure student has this book issued
    dbo.collection("Students").findOne({ rollNo }, (err, student) => {
      if (err) { client.close(); return res.status(500).send("Failed to fetch student ❌"); }
      if (!student) { client.close(); return res.status(404).send("Student not found ❌"); }

      const issued = Array.isArray(student.issuedBooks) ? student.issuedBooks : [];
      const hasBook = issued.some(b => Number(b.bookId) === bookId);

      if (!hasBook) {
        client.close();
        return res.status(400).send("This book is not issued to this student ❌");
      }

      // 2) Remove from student.issuedBooks
      dbo.collection("Students").updateOne(
        { rollNo },
        { $pull: { issuedBooks: { bookId: bookId } } },
        (err, sUpd) => {
          if (err) { client.close(); return res.status(500).send("Failed to update student ❌"); }
          if (!sUpd || sUpd.matchedCount === 0) { client.close(); return res.status(404).send("Student not found ❌"); }

          // 3) Increase book quantity
          dbo.collection("tblBooks").findOneAndUpdate(
            { id: bookId },
            { $inc: { quantity: 1 }, $set: { status: "Available" } },
            { returnDocument: "after" },
            (err, bUpd) => {
              client.close();

              if (err) return res.status(500).send("Failed to update book ❌");
              if (!bUpd || !bUpd.value) {
                // Best effort: student already updated
                return res.status(404).send("Book not found (student updated) ❌");
              }

              res.send("Book returned successfully ✅");
            }
          );
        }
      );
    });
  });
});

app.listen(2200);
console.log("Server Started on : http://127.0.0.1:2200");
